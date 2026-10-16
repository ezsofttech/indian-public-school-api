import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UploadsService } from '../uploads/uploads.service';
import { PublicDisclosureRepository } from './public-disclosure.repository';
import {
  PublicDisclosureSection,
  PublicDisclosureSectionDocument,
} from './schemas/public-disclosure-section.schema';
import {
  PublicDisclosureConfig,
  PublicDisclosureConfigDocument,
} from './schemas/public-disclosure-config.schema';
import {
  DisclosureItem,
  DisclosureSection,
  DisclosureView,
} from './interfaces/disclosure.interface';
import {
  CreatePublicDisclosureSectionDto,
  UpdatePublicDisclosureSectionDto,
  ReorderSectionsDto,
  DisclosureItemDto,
  UpdatePublicDisclosureConfigDto,
} from './dto';
import { generatePublicId } from '../common/utils/public-id';
import {
  CloudinaryRecordFallback,
  CLOUDINARY_FALLBACK_EVENTS,
} from '../uploads/utils/cloudinary-fallback.util';
import {
  serializeItemsSrNo,
  detectSequenceType,
  SequenceType,
} from './utils/sequence-serializer.util';

@Injectable()
export class PublicDisclosureService {
  private readonly logger = new Logger(PublicDisclosureService.name);

  constructor(
    private readonly repository: PublicDisclosureRepository,
    private readonly uploadsService: UploadsService,
    @InjectModel(PublicDisclosureSection.name)
    private readonly sectionModel: Model<PublicDisclosureSectionDocument>,
    @InjectModel(PublicDisclosureConfig.name)
    private readonly configModel: Model<PublicDisclosureConfigDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Helper: Validate disclosure row constraints.
   */
  private validateItems(items?: DisclosureItemDto[] | DisclosureItem[]): void {
    if (!items || !Array.isArray(items)) return;

    for (const item of items) {
      if (!item.title || !item.title.trim()) {
        throw new BadRequestException(`Row #${item.srNo ?? '?'}: Row title is required.`);
      }
    }
  }

  /**
   * Helper: Extract all document URLs present in an array of items.
   */
  private extractItemUrls(items?: any[]): string[] {
    if (!items || !Array.isArray(items)) return [];
    const urls: string[] = [];
    for (const item of items) {
      if (item?.view?.url && typeof item.view.url === 'string' && item.view.url.trim()) {
        urls.push(item.view.url.trim());
      }
    }
    return urls;
  }

  /**
   * Helper: Check if a URL is currently referenced by ANY saved section/row.
   * Optionally exclude a specific sectionId when checking for replacements.
   */
  async isUrlReferencedInDatabase(url: string, excludeSectionId?: string): Promise<boolean> {
    if (!url || !url.trim()) return false;
    const cleanUrl = url.trim();

    const query: Record<string, any> = {
      'items.view.url': cleanUrl,
    };

    if (excludeSectionId) {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(excludeSectionId);
      if (isObjectId) {
        query._id = { $ne: excludeSectionId };
      } else {
        query.publicId = { $ne: excludeSectionId };
      }
    }

    const count = await this.sectionModel.countDocuments(query).exec();
    return count > 0;
  }

  /**
   * List all sections with their items, sorted by display order.
   */
  async findAll(publishedOnly: boolean = false): Promise<PublicDisclosureSectionDocument[]> {
    const filter: Record<string, any> = {};
    if (publishedOnly) {
      filter.isPublished = true;
    }
    const sections = await this.repository.findAllOrdered(filter);

    // If database has 0 sections, seed standard CBSE default sections
    if (sections.length === 0 && !publishedOnly) {
      await this.seedDefaultSections();
      return this.repository.findAllOrdered(filter);
    }

    return sections;
  }

  /**
   * Find a single section by MongoDB _id, publicId, or sectionKey.
   */
  async findOne(idOrKey: string): Promise<PublicDisclosureSectionDocument> {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrKey);
    let section: PublicDisclosureSectionDocument | null = null;

    if (isObjectId) {
      section = (await this.sectionModel.findById(idOrKey).lean().exec()) as any;
    } else {
      section = (await this.sectionModel
        .findOne({ $or: [{ publicId: idOrKey }, { sectionKey: idOrKey.toUpperCase() }] })
        .lean()
        .exec()) as any;
    }

    if (!section) {
      throw new NotFoundException(`Public disclosure section "${idOrKey}" not found`);
    }

    return section;
  }

  /**
   * Create a new disclosure section with transactional save & event fallback cleanup.
   */
  async createSection(
    dto: CreatePublicDisclosureSectionDto,
    user?: any,
  ): Promise<PublicDisclosureSectionDocument> {
    this.validateItems(dto.items);

    let resolvedKey = dto.sectionKey?.trim().toUpperCase();
    if (!resolvedKey) {
      // Auto-generate clean unique key in background from title
      const baseKey =
        dto.sectionTitle
          .toUpperCase()
          .replace(/^([A-Z]\.|\d+\.)\s*/, '')
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 35) || 'SECTION';

      resolvedKey = baseKey;
      let counter = 1;
      while (await this.repository.findBySectionKey(resolvedKey)) {
        resolvedKey = `${baseKey}_${counter++}`;
      }
    } else {
      const existingKey = await this.repository.findBySectionKey(resolvedKey);
      if (existingKey) {
        throw new BadRequestException(
          `Section key "${resolvedKey}" already exists. Please use a unique key.`,
        );
      }
    }

    const rawItems: DisclosureItem[] = (dto.items || []).map((item, idx) => ({
      srNo: item.srNo !== undefined && item.srNo !== null && String(item.srNo).trim() !== ''
        ? item.srNo
        : idx + 1,
      title: (item.title || '').trim(),
      detail: item.detail?.trim() || null,
      view: (item.view?.url && typeof item.view.url === 'string' && item.view.url.trim().length > 0)
        ? {
            label: item.view.label?.trim() || 'VIEW',
            type: item.view.type || 'PDF',
            url: item.view.url.trim(),
            openInNewTab: item.view.openInNewTab !== false,
          }
        : null,
    }));

    const targetSeqType = dto.sequenceStyle || detectSequenceType(rawItems);
    const sanitizedItems: DisclosureItem[] = serializeItemsSrNo(rawItems, targetSeqType);

    const order =
      dto.order !== undefined
        ? Number(dto.order)
        : await this.sectionModel.countDocuments().exec();

    const sectionPayload: Partial<PublicDisclosureSection> = {
      publicId: generatePublicId('DISC'),
      sectionKey: resolvedKey,
      sectionTitle: dto.sectionTitle.trim(),
      order,
      isPublished: dto.isPublished !== false,
      items: sanitizedItems,
    };

    const sessionId = dto.sessionId?.trim();

    let session: any = null;
    let isTxActive = false;

    try {
      session = await this.connection.startSession();
      session.startTransaction();
      isTxActive = true;
    } catch {
      session = null;
      isTxActive = false;
    }

    try {
      const createdEntity = new this.sectionModel(sectionPayload);
      const savedDoc = (await createdEntity.save({ session: isTxActive ? session : undefined })) as any;

      if (isTxActive && session) {
        await session.commitTransaction();
      }

      // Commit staged files on successful save via event fallback utility
      const savedUrls = this.extractItemUrls(sanitizedItems);
      CloudinaryRecordFallback.commit(savedUrls, this.eventEmitter);

      // Clean up any other staged files for this session that were NOT included in the final save
      if (sessionId) {
        const stagedSessionUrls = CloudinaryRecordFallback.getStagedUrlsForSession(sessionId);
        const uncommittedUrls = stagedSessionUrls.filter((u) => !savedUrls.includes(u));
        if (uncommittedUrls.length > 0) {
          await CloudinaryRecordFallback.abort(
            { urls: uncommittedUrls, sessionId },
            (url) => this.uploadsService.deleteFileByUrl(url),
            this.eventEmitter,
          );
        }
      }

      return savedDoc.toObject ? savedDoc.toObject() : savedDoc;
    } catch (saveError: any) {
      if (isTxActive && session) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore
        }
      }

      // COMPENSATING CLEANUP ON SAVE FAILURE:
      // Abort newly uploaded files belonging exclusively to this session
      if (sessionId) {
        this.logger.warn(
          `Compensating cleanup triggered for session "${sessionId}" after failed createSection: ${saveError.message}`,
        );
        await CloudinaryRecordFallback.abort(
          { sessionId },
          async (url) => {
            const isReferenced = await this.isUrlReferencedInDatabase(url);
            if (!isReferenced) {
              return this.uploadsService.deleteFileByUrl(url);
            }
            return false;
          },
          this.eventEmitter,
        );
      }

      throw saveError;
    } finally {
      if (session) {
        try {
          session.endSession();
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Update an existing disclosure section with rollback & event fallback cleanup.
   */
  async updateSection(
    id: string,
    dto: UpdatePublicDisclosureSectionDto,
    user?: any,
  ): Promise<PublicDisclosureSectionDocument> {
    if (dto.items) {
      this.validateItems(dto.items);
    }

    const existingSection = await this.findOne(id);
    const existingSectionId = String((existingSection as any)._id || (existingSection as any).id);

    // If sectionKey is being updated, verify uniqueness
    if (dto.sectionKey && dto.sectionKey.trim().toUpperCase() !== existingSection.sectionKey) {
      const conflict = await this.repository.findBySectionKey(dto.sectionKey);
      if (conflict) {
        throw new BadRequestException(
          `Section key "${dto.sectionKey.toUpperCase()}" already exists.`,
        );
      }
    }

    // Collect previously referenced file URLs in this section before update
    const previousUrls = this.extractItemUrls(existingSection.items);

    const updateFields: Record<string, any> = {};
    if (dto.sectionKey !== undefined) updateFields.sectionKey = dto.sectionKey.trim().toUpperCase();
    if (dto.sectionTitle !== undefined) updateFields.sectionTitle = dto.sectionTitle.trim();
    if (dto.order !== undefined) updateFields.order = Number(dto.order);
    if (dto.isPublished !== undefined) updateFields.isPublished = Boolean(dto.isPublished);

    let activeSeqType: SequenceType | undefined;

    if (dto.items !== undefined) {
      activeSeqType = dto.sequenceStyle || detectSequenceType(dto.items);

      const rawUpdateItems: DisclosureItem[] = dto.items.map((item, idx) => ({
        srNo: item.srNo !== undefined && item.srNo !== null && String(item.srNo).trim() !== ''
          ? item.srNo
          : idx + 1,
        title: (item.title || '').trim(),
        detail: item.detail?.trim() || null,
        view: (item.view?.url && typeof item.view.url === 'string' && item.view.url.trim().length > 0)
          ? {
              label: item.view.label?.trim() || 'VIEW',
              type: item.view.type || 'PDF',
              url: item.view.url.trim(),
              openInNewTab: item.view.openInNewTab !== false,
            }
          : null,
      }));
      updateFields.items = serializeItemsSrNo(rawUpdateItems, activeSeqType);
    }

    const newIncomingUrls = dto.items !== undefined ? this.extractItemUrls(updateFields.items) : previousUrls;
    const sessionId = dto.sessionId?.trim();

    let session: any = null;
    let isTxActive = false;

    try {
      session = await this.connection.startSession();
      session.startTransaction();
      isTxActive = true;
    } catch {
      session = null;
      isTxActive = false;
    }

    let updatedDoc: any;

    try {
      const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
      const filter = isObjectId ? { _id: id } : { publicId: id };

      updatedDoc = await this.sectionModel
        .findOneAndUpdate(filter, updateFields, {
          returnDocument: 'after',
          session: isTxActive ? session : undefined,
        })
        .lean()
        .exec();

      if (isTxActive && session) {
        await session.commitTransaction();
      }

      // Commit newly saved URLs
      CloudinaryRecordFallback.commit(newIncomingUrls, this.eventEmitter);

      // Clean up any other staged files for this session that were NOT included in the final update
      if (sessionId) {
        const stagedSessionUrls = CloudinaryRecordFallback.getStagedUrlsForSession(sessionId);
        const uncommittedUrls = stagedSessionUrls.filter((u) => !newIncomingUrls.includes(u));
        if (uncommittedUrls.length > 0) {
          await CloudinaryRecordFallback.abort(
            { urls: uncommittedUrls, sessionId },
            (url) => this.uploadsService.deleteFileByUrl(url),
            this.eventEmitter,
          );
        }
      }

      // Automatically synchronize all other sections to follow the same sequence context
      if (activeSeqType) {
        try {
          const targetId = (updatedDoc as any)?._id || (updatedDoc as any)?.id;
          const otherSections = await this.sectionModel
            .find(targetId ? { _id: { $ne: targetId } } : {})
            .exec();

          for (const otherSec of otherSections) {
            if (otherSec.items && otherSec.items.length > 0) {
              const currentType = detectSequenceType(otherSec.items);
              if (currentType !== activeSeqType) {
                otherSec.items = serializeItemsSrNo(otherSec.items, activeSeqType);
                await otherSec.save();
              }
            }
          }
        } catch (err: any) {
          this.logger.warn(
            `Failed to auto-sync other sections sequence context: ${err.message}`,
          );
        }
      }
    } catch (saveError: any) {
      if (isTxActive && session) {
        try {
          await session.abortTransaction();
        } catch {
          // ignore
        }
      }

      // COMPENSATING CLEANUP ON UPDATE FAILURE:
      // Abort newly uploaded files belonging exclusively to this failed session
      if (sessionId) {
        this.logger.warn(
          `Compensating cleanup triggered for session "${sessionId}" after failed updateSection: ${saveError.message}`,
        );
        await CloudinaryRecordFallback.abort(
          { sessionId },
          async (url) => {
            const isReferenced = await this.isUrlReferencedInDatabase(url);
            if (!isReferenced) {
              return this.uploadsService.deleteFileByUrl(url);
            }
            return false;
          },
          this.eventEmitter,
        );
      }

      throw saveError;
    } finally {
      if (session) {
        try {
          session.endSession();
        } catch {
          // ignore
        }
      }
    }

    // REPLACED FILES CLEANUP (after successful commit):
    // Identify URLs that were removed during this update
    const removedUrls = previousUrls.filter((url) => !newIncomingUrls.includes(url));
    for (const oldUrl of removedUrls) {
      // Confirm that the asset is NOT referenced anywhere else in the entire database
      const isStillReferenced = await this.isUrlReferencedInDatabase(oldUrl);
      if (!isStillReferenced) {
        try {
          this.logger.log(`Deleting unreferenced replaced asset: ${oldUrl}`);
          await this.uploadsService.deleteFileByUrl(oldUrl);
        } catch (cleanupErr: any) {
          this.logger.warn(`Failed to cleanup replaced asset ${oldUrl}: ${cleanupErr.message}`);
        }
      }
    }

    return updatedDoc;
  }

  /**
   * Delete an entire disclosure section and clean up its exclusive unreferenced files.
   */
  async removeSection(id: string): Promise<{ deleted: boolean; id: string }> {
    const existing = await this.findOne(id);
    const sectionUrls = this.extractItemUrls(existing.items);

    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const filter = isObjectId ? { _id: id } : { publicId: id };

    await this.sectionModel.deleteOne(filter).exec();

    // Clean up files that belonged to this section and are not referenced elsewhere
    for (const url of sectionUrls) {
      const isReferenced = await this.isUrlReferencedInDatabase(url);
      if (!isReferenced) {
        try {
          await this.uploadsService.deleteFileByUrl(url);
        } catch (err: any) {
          this.logger.warn(`Could not delete asset ${url} after section deletion: ${err.message}`);
        }
      }
    }

    return { deleted: true, id };
  }

  /**
   * Reorder sections batch update.
   */
  async reorderSections(dto: ReorderSectionsDto): Promise<{ success: boolean }> {
    if (!dto.sections || !Array.isArray(dto.sections)) {
      throw new BadRequestException('Sections array is required for reordering');
    }

    const updates = dto.sections.map((item) =>
      this.repository.updateOrder(item.id, Number(item.order)),
    );
    await Promise.all(updates);

    return { success: true };
  }

  /**
   * Upload a document via the existing UploadsService and track it in event-based fallback.
   */
  async uploadDocument(
    file: Express.Multer.File,
    sessionId?: string,
    user?: any,
  ): Promise<{
    url: string;
    fileUrl: string[];
    mimeType: string;
    key?: string;
    provider?: string;
  }> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided or file buffer is empty');
    }

    // Use existing UploadsService: folder "Documents/Disclosure"
    const uploadResult = await this.uploadsService.upload(
      file,
      'Documents',
      file.originalname,
      'Documents/Disclosure',
    );

    const resolvedUrl = uploadResult.url || (Array.isArray(uploadResult.fileUrl) ? uploadResult.fileUrl[0] : '');

    if (!resolvedUrl) {
      throw new BadRequestException('Storage provider returned no valid URL');
    }

    const effectiveSessionId = sessionId?.trim() || generatePublicId('SES');

    // Register with event-based CloudinaryRecordFallback
    CloudinaryRecordFallback.track(resolvedUrl, {
      sessionId: effectiveSessionId,
      storageKey: uploadResult.key,
      timeoutMs: 15 * 60 * 1000, // 15 min fallback timer
      eventEmitter: this.eventEmitter,
      deleteHandler: (url) => this.uploadsService.deleteFileByUrl(url),
    });

    return {
      url: resolvedUrl,
      fileUrl: uploadResult.fileUrl || [resolvedUrl],
      mimeType: uploadResult.mimeType || file.mimetype,
      key: uploadResult.key,
      provider: uploadResult.provider,
    };
  }

  /**
   * Cancel / Discard a staged upload before saving.
   * Verifies that the file is NOT referenced by any saved record before deleting.
   */
  async cancelStagedUpload(
    url: string,
    sessionId: string,
    user?: any,
  ): Promise<{ cancelled: boolean; url: string }> {
    if (!url || !url.trim()) {
      throw new BadRequestException('URL is required');
    }

    const cleanUrl = url.trim();

    // Data integrity safeguard: Never delete if already referenced by any saved record
    const isReferenced = await this.isUrlReferencedInDatabase(cleanUrl);
    if (isReferenced) {
      throw new BadRequestException(
        'Cannot cancel or delete file: it is already referenced by a saved disclosure record.',
      );
    }

    try {
      await CloudinaryRecordFallback.abort(
        { url: cleanUrl, sessionId: sessionId.trim() },
        (u) => this.uploadsService.deleteFileByUrl(u),
        this.eventEmitter,
        true,
      );
      return { cancelled: true, url: cleanUrl };
    } catch (err: any) {
      this.logger.error(`Error deleting cancelled staged upload ${cleanUrl}: ${err.message}`);
      throw new BadRequestException(`Cloudinary deletion failed: ${err.message}`);
    }
  }

  /**
   * Manual trigger to cleanup abandoned staged uploads.
   * With event-based fallback, files are automatically purged when their timer expires.
   */
  async cleanupAbandonedUploads(maxAgeHours: number = 2): Promise<{ cleaned: number; message: string }> {
    this.logger.log(`Manual cleanup triggered for abandoned uploads older than ${maxAgeHours} hours.`);
    return {
      cleaned: 0,
      message: 'CloudinaryRecordFallback event-based timer is active and automatically cleans orphaned uploads.',
    };
  }

  /**
   * Default CBSE Mandatory Public Disclosure Sections.
   */
  async seedDefaultSections(): Promise<void> {
    const count = await this.sectionModel.countDocuments().exec();
    if (count > 0) return;

    this.logger.log('Seeding standard CBSE Mandatory Public Disclosure template...');

    const defaultSections: Partial<PublicDisclosureSection>[] = [
      {
        publicId: generatePublicId('DISC'),
        sectionKey: 'GENERAL_INFORMATION',
        sectionTitle: 'A. GENERAL INFORMATION',
        order: 1,
        isPublished: true,
        items: [
          {
            srNo: 1,
            title: 'NAME OF THE SCHOOL',
            detail: 'INDIAN PUBLIC SCHOOL',
            view: null,
          },
          {
            srNo: 2,
            title: 'AFFILIATION NO. (IF APPLICABLE)',
            detail: '330833',
            view: null,
          },
          {
            srNo: 3,
            title: 'SCHOOL CODE (IF APPLICABLE)',
            detail: '65830',
            view: null,
          },
          {
            srNo: 4,
            title: 'COMPLETE ADDRESS WITH PIN CODE',
            detail: 'VILL-RAGHUNATHPUR, PO-KOTHIA, VIA-TAJPUR, DIST-SAMASTIPUR, BIHAR, PIN-848130',
            view: null,
          },
          {
            srNo: 5,
            title: 'PRINCIPAL NAME & QUALIFICATION',
            detail: 'Mr. Principal, M.Sc., B.Ed.',
            view: null,
          },
          {
            srNo: 6,
            title: 'SCHOOL EMAIL ID',
            detail: 'ipsraghunathpur@gmail.com',
            view: null,
          },
          {
            srNo: 7,
            title: 'CONTACT DETAILS (LANDLINE/MOBILE)',
            detail: '+91 9431878840 / +91 9934241077',
            view: null,
          },
        ],
      },
      {
        publicId: generatePublicId('DISC'),
        sectionKey: 'DOCUMENTS_AND_INFORMATION',
        sectionTitle: 'B. DOCUMENTS AND INFORMATION',
        order: 2,
        isPublished: true,
        items: [
          {
            srNo: 1,
            title: 'COPIES OF AFFILIATION/UPGRADATION LETTER AND RECENT EXTENSION OF AFFILIATION, IF ANY',
            detail: 'Affiliation and extension grant letter issued by CBSE New Delhi.',
            view: null,
          },
          {
            srNo: 2,
            title: 'COPIES OF SOCIETIES/TRUST/COMPANY REGISTRATION/RENEWAL CERTIFICATE, AS APPLICABLE',
            detail: 'Aakash Foundation Trust registration certificate.',
            view: null,
          },
          {
            srNo: 3,
            title: 'COPY OF NO OBJECTION CERTIFICATE (NOC) ISSUED, IF APPLICABLE, BY THE STATE GOVT./UT',
            detail: 'State Government of Bihar NOC certification document.',
            view: null,
          },
          {
            srNo: 4,
            title: 'COPIES OF RECOGNITION CERTIFICATE UNDER RTE ACT, 2009, AND IT’S RENEWAL IF ANY',
            detail: 'Recognition certificate under RTE Act 2009 issued by competent authority.',
            view: null,
          },
          {
            srNo: 5,
            title: 'COPY OF VALID BUILDING SAFETY CERTIFICATE AS PER THE NATIONAL BUILDING CODE',
            detail: 'Building safety evaluation and stability compliance certificate.',
            view: null,
          },
          {
            srNo: 6,
            title: 'COPY OF VALID FIRE SAFETY CERTIFICATE ISSUED BY THE COMPETENT AUTHORITY',
            detail: 'Fire safety inspection and clearance certificate.',
            view: null,
          },
          {
            srNo: 7,
            title: 'COPY OF THE SELF CERTIFICATION SUBMITTED BY THE SCHOOL FOR AFFILIATION/UPGRADATION',
            detail: 'Official self-certification document submitted to CBSE.',
            view: null,
          },
          {
            srNo: 8,
            title: 'COPIES OF VALID WATER, HEALTH AND SANITATION CERTIFICATES',
            detail: 'Safe drinking water and sanitary condition clearance certificate.',
            view: null,
          },
        ],
      },
      {
        publicId: generatePublicId('DISC'),
        sectionKey: 'RESULT_AND_ACADEMICS',
        sectionTitle: 'C. RESULT AND ACADEMICS',
        order: 3,
        isPublished: true,
        items: [
          {
            srNo: 1,
            title: 'FEE STRUCTURE OF THE SCHOOL',
            detail: 'Fee chart for Nursery to Senior Secondary academic levels.',
            view: null,
          },
          {
            srNo: 2,
            title: 'ANNUAL ACADEMIC CALENDAR',
            detail: 'Curriculum schedule, examination timetable, and activities calendar.',
            view: null,
          },
          {
            srNo: 3,
            title: 'LIST OF SCHOOL MANAGEMENT COMMITTEE (SMC)',
            detail: 'Details and designations of SMC members.',
            view: null,
          },
          {
            srNo: 4,
            title: 'LIST OF PARENTS TEACHERS ASSOCIATION (PTA) MEMBERS',
            detail: 'Office bearers and executive committee of PTA.',
            view: null,
          },
          {
            srNo: 5,
            title: 'LAST THREE-YEAR RESULT OF THE BOARD EXAMINATION AS PER APPLICABILITY',
            detail: 'CBSE Class X and Class XII board examination pass percentage and highlights.',
            view: null,
          },
        ],
      },
      {
        publicId: generatePublicId('DISC'),
        sectionKey: 'STAFF_TEACHING',
        sectionTitle: 'D. STAFF (TEACHING)',
        order: 4,
        isPublished: true,
        items: [
          {
            srNo: 1,
            title: 'PRINCIPAL',
            detail: '1',
            view: null,
          },
          {
            srNo: 2,
            title: 'TOTAL NO. OF TEACHERS',
            detail: 'PGT: 10, TGT: 14, PRT: 18, NTT: 6 (Total: 48)',
            view: null,
          },
          {
            srNo: 3,
            title: 'TEACHERS SECTION RATIO',
            detail: '1.5 : 1',
            view: null,
          },
          {
            srNo: 4,
            title: 'DETAILS OF SPECIAL EDUCATOR',
            detail: 'Qualified Special Educator on campus providing inclusive learning support.',
            view: null,
          },
          {
            srNo: 5,
            title: 'DETAILS OF COUNSELLOR AND WELLNESS TEACHER',
            detail: 'Certified Adolescent Psychologist & Student Wellness Officer.',
            view: null,
          },
        ],
      },
      {
        publicId: generatePublicId('DISC'),
        sectionKey: 'SCHOOL_INFRASTRUCTURE',
        sectionTitle: 'E. SCHOOL INFRASTRUCTURE',
        order: 5,
        isPublished: true,
        items: [
          {
            srNo: 1,
            title: 'TOTAL CAMPUS AREA OF THE SCHOOL (IN SQUARE MTRS)',
            detail: '8,093.71 Sq. Mtrs (2.00 Acres)',
            view: null,
          },
          {
            srNo: 2,
            title: 'NO. AND SIZE OF THE CLASS ROOMS (IN SQ MTRS)',
            detail: '42 Classrooms (500 Sq. Ft / 46.45 Sq. Mtrs each)',
            view: null,
          },
          {
            srNo: 3,
            title: 'NO. AND SIZE OF LABORATORIES INCLUDING COMPUTER LABS (IN SQ MTRS)',
            detail: 'Physics, Chemistry, Biology, Mathematics & Composite Science Lab (600 Sq. Ft each); Computer Lab (1000 Sq. Ft)',
            view: null,
          },
          {
            srNo: 4,
            title: 'INTERNET FACILITY (Y/N)',
            detail: 'YES (High-speed 100 Mbps optical fiber Wi-Fi enabled campus)',
            view: null,
          },
          {
            srNo: 5,
            title: 'NO. OF GIRLS TOILETS & BOYS TOILETS',
            detail: 'Girls Toilets: 20, Boys Toilets: 24 (Hygienic, automated sanitation)',
            view: null,
          },
          {
            srNo: 6,
            title: 'LINK OF YOUTUBE VIDEO OF THE INSPECTION OF SCHOOL COVERING THE INFRASTRUCTURE',
            detail: 'Comprehensive video walk-through of the school infrastructure and labs.',
            view: {
              label: 'VIEW VIDEO',
              type: 'LINK',
              url: 'https://www.youtube.com',
              openInNewTab: true,
            },
          },
        ],
      },
    ];

    await this.sectionModel.insertMany(defaultSections);
    this.logger.log('CBSE Mandatory Public Disclosure default template seeded successfully.');
  }

  /**
   * Synchronize sequence style (1,2,3... / A,B,C... / I,II,III...) across all sections.
   */
  async syncAllSectionsSequenceStyle(
    sequenceStyle: SequenceType,
  ): Promise<PublicDisclosureSectionDocument[]> {
    const allSections = await this.sectionModel.find().exec();
    for (const section of allSections) {
      if (section.items && section.items.length > 0) {
        section.items = serializeItemsSrNo(section.items, sequenceStyle);
        await section.save();
      }
    }
    return this.findAll();
  }

  /**
   * Get public disclosure statutory configuration (Affiliation No, School Code, Notice).
   */
  async getConfig(): Promise<PublicDisclosureConfigDocument> {
    let config = await this.configModel.findOne().exec();
    if (!config) {
      config = await this.configModel.create({
        affiliationNo: '330833',
        schoolCode: '65830',
        showNotice: true,
        complianceNote:
          "Fields marked [Enter details] and document links are awaiting the school's verified information.",
      });
    }
    return config;
  }

  /**
   * Update public disclosure statutory configuration.
   */
  async updateConfig(
    dto: UpdatePublicDisclosureConfigDto,
    user?: any,
  ): Promise<PublicDisclosureConfigDocument> {
    let config = await this.configModel.findOne().exec();
    if (!config) {
      config = new this.configModel();
    }
    if (dto.affiliationNo !== undefined) config.affiliationNo = dto.affiliationNo.trim();
    if (dto.schoolCode !== undefined) config.schoolCode = dto.schoolCode.trim();
    if (dto.showNotice !== undefined) config.showNotice = dto.showNotice;
    if (dto.complianceNote !== undefined) config.complianceNote = dto.complianceNote.trim();

    await config.save();
    this.logger.log(
      `Public disclosure config updated by user: ${user?.username || user?.id || 'admin'}`,
    );
    return config;
  }
}

