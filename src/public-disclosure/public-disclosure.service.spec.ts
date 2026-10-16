import {
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('@nestjs/mongoose', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  return {
    InjectModel: (name: string) => Inject(`${name}Model`),
    InjectConnection: () => Inject('DatabaseConnection'),
    Prop: () => (target: any, key: string) => {},
    Schema: () => (target: any) => {},
    SchemaFactory: {
      createForClass: () => ({}),
    },
  };
});

jest.mock('@nestjs/config', () => ({
  ConfigService: class {},
}));

jest.mock('@nestjs/cache-manager', () => ({
  CACHE_MANAGER: 'CACHE_MANAGER',
}));

jest.mock('@nestjs/event-emitter', () => {
  return {
    EventEmitter2: class {
      emit = jest.fn();
      on = jest.fn();
    },
  };
});

import { Test, TestingModule } from '@nestjs/testing';
const getModelToken = (model: string) => `${model}Model`;
const getConnectionToken = () => 'DatabaseConnection';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PublicDisclosureService } from './public-disclosure.service';
import { PublicDisclosureRepository } from './public-disclosure.repository';
import { UploadsService } from '../uploads/uploads.service';
import { PublicDisclosureSection } from './schemas/public-disclosure-section.schema';
import {
  CloudinaryRecordFallback,
  CLOUDINARY_FALLBACK_EVENTS,
} from '../uploads/utils/cloudinary-fallback.util';

describe('PublicDisclosureService with Event-Based Fallback', () => {
  let service: PublicDisclosureService;
  let mockRepository: any;
  let mockUploadsService: any;
  let mockSectionModel: any;
  let mockConnection: any;
  let mockEventEmitter: any;

  beforeEach(async () => {
    CloudinaryRecordFallback.reset();

    mockRepository = {
      findBySectionKey: jest.fn(),
      findAllOrdered: jest.fn(),
      updateOrder: jest.fn(),
    };

    mockUploadsService = {
      upload: jest.fn(),
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
    };

    const mockSave = jest.fn();
    mockSectionModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: mockSave.mockResolvedValue({
        ...dto,
        _id: '507f1f77bcf86cd799439011',
        toObject: () => ({ ...dto, _id: '507f1f77bcf86cd799439011' }),
      }),
    })) as any;

    mockSectionModel.findById = jest.fn();
    mockSectionModel.findOne = jest.fn();
    mockSectionModel.find = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
    mockSectionModel.countDocuments = jest
      .fn()
      .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
    mockSectionModel.findOneAndUpdate = jest.fn();
    mockSectionModel.deleteOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });
    mockSectionModel.insertMany = jest.fn().mockResolvedValue([]);

    mockConnection = {
      startSession: jest
        .fn()
        .mockRejectedValue(new Error('No replica set in test')),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicDisclosureService,
        {
          provide: PublicDisclosureRepository,
          useValue: mockRepository,
        },
        {
          provide: UploadsService,
          useValue: mockUploadsService,
        },
        {
          provide: getModelToken(PublicDisclosureSection.name),
          useValue: mockSectionModel,
        },
        {
          provide: getConnectionToken(),
          useValue: mockConnection,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<PublicDisclosureService>(PublicDisclosureService);
  });

  afterEach(() => {
    CloudinaryRecordFallback.reset();
    jest.clearAllMocks();
  });

  describe('Scenario 1: Creating a text-only disclosure row', () => {
    it('should successfully create section with text-only row', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionKey: 'GENERAL_INFO',
        sectionTitle: 'A. General Information',
        items: [
          {
            srNo: 1,
            title: 'SCHOOL NAME',
            detail: 'Indian Public School',
          },
        ],
      };

      const result = await service.createSection(dto);
      expect(result).toBeDefined();
      expect(result.sectionKey).toBe('GENERAL_INFO');
      expect(result.items[0].detail).toBe('Indian Public School');
      expect(result.items[0].view).toBeNull();
    });

    it('should auto-generate clean unique sectionKey in background when user does not enter sectionKey', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionTitle: 'B. Infrastructure & Transport Facilities',
        items: [
          {
            srNo: 1,
            title: 'CAMPUS AREA',
            detail: '8,093.71 Sq. Mtrs',
          },
        ],
      };

      const result = await service.createSection(dto as any);
      expect(result).toBeDefined();
      expect(result.sectionKey).toBe('INFRASTRUCTURE_TRANSPORT_FACILITIES');
    });
  });

  describe('Scenario 2: Creating a document-only disclosure row', () => {
    it('should successfully create section with document-only row', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionKey: 'DOCS',
        sectionTitle: 'B. Documents',
        items: [
          {
            srNo: 1,
            title: 'AFFILIATION LETTER',
            view: {
              label: 'VIEW',
              type: 'PDF' as const,
              url: '/Documents/Disclosure/affiliation.pdf',
              openInNewTab: true,
            },
          },
        ],
      };

      const result = await service.createSection(dto);
      expect(result).toBeDefined();
      expect(result.items[0].view?.url).toBe(
        '/Documents/Disclosure/affiliation.pdf',
      );
    });
  });

  describe('Scenario 3: Creating a disclosure with both text and document', () => {
    it('should successfully create section with both detail and document view', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionKey: 'STAFF',
        sectionTitle: 'D. Staff',
        items: [
          {
            srNo: 1,
            title: 'TOTAL TEACHERS',
            detail: '48 Teachers currently on roll',
            view: {
              label: 'VIEW LIST',
              type: 'PDF' as const,
              url: '/Documents/Disclosure/staff-list.pdf',
              openInNewTab: true,
            },
          },
        ],
      };

      const result = await service.createSection(dto);
      expect(result).toBeDefined();
      expect(result.items[0].detail).toBe('48 Teachers currently on roll');
      expect(result.items[0].view?.url).toBe(
        '/Documents/Disclosure/staff-list.pdf',
      );
    });

    it('should accept row when detail or document view are omitted or empty, normalizing view to null', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionKey: 'OPTIONAL_ROW',
        sectionTitle: 'Draft Section',
        items: [
          {
            srNo: 1,
            title: 'HEADER ONLY ITEM',
            // detail omitted
            view: { url: '' }, // empty url should not throw
          },
        ],
      };

      const result = await service.createSection(dto as any);
      expect(result).toBeDefined();
      expect(result.items[0].title).toBe('HEADER ONLY ITEM');
      expect(result.items[0].view).toBeNull();
    });

    it('should reject row only if row title is empty', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionKey: 'EMPTY_TITLE',
        sectionTitle: 'Invalid Section',
        items: [
          {
            srNo: 1,
            title: '',
          },
        ],
      };

      await expect(service.createSection(dto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Scenario 4: Updating an existing disclosure without changing its file', () => {
    it('should preserve original document URL without triggering deletions', async () => {
      const existingSection = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'DISC-1',
        sectionKey: 'DOCS',
        sectionTitle: 'B. Documents',
        items: [
          {
            srNo: 1,
            title: 'AFFILIATION LETTER',
            detail: 'Initial detail',
            view: { url: '/Documents/Disclosure/affiliation.pdf' },
          },
        ],
      };

      mockSectionModel.findById.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });
      mockSectionModel.findOne.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            ...existingSection,
            items: [
              {
                ...existingSection.items[0],
                detail: 'Updated detail text',
              },
            ],
          }),
        }),
      });

      const updateDto = {
        items: [
          {
            srNo: 1,
            title: 'AFFILIATION LETTER',
            detail: 'Updated detail text',
            view: {
              label: 'VIEW',
              type: 'PDF' as const,
              url: '/Documents/Disclosure/affiliation.pdf',
            },
          },
        ],
      };

      const res = await service.updateSection(
        '507f1f77bcf86cd799439011',
        updateDto,
      );
      expect(res).toBeDefined();
      expect(mockUploadsService.deleteFileByUrl).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 5: Replacing a file successfully', () => {
    it('should safely delete the unreferenced old file only after replacement commit', async () => {
      const existingSection = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'DISC-1',
        sectionKey: 'DOCS',
        sectionTitle: 'B. Documents',
        items: [
          {
            srNo: 1,
            title: 'NOC',
            view: { url: '/Documents/Disclosure/old-noc.pdf' },
          },
        ],
      };

      mockSectionModel.findById.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });
      mockSectionModel.findOne.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            ...existingSection,
            items: [
              {
                srNo: 1,
                title: 'NOC',
                view: { url: '/Documents/Disclosure/new-noc.pdf' },
              },
            ],
          }),
        }),
      });

      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const updateDto = {
        items: [
          {
            srNo: 1,
            title: 'NOC',
            view: {
              label: 'VIEW',
              type: 'PDF' as const,
              url: '/Documents/Disclosure/new-noc.pdf',
            },
          },
        ],
      };

      await service.updateSection('507f1f77bcf86cd799439011', updateDto);

      expect(mockUploadsService.deleteFileByUrl).toHaveBeenCalledWith(
        '/Documents/Disclosure/old-noc.pdf',
      );
    });
  });

  describe('Scenario 6: Database save failure triggers compensating cleanup of newly uploaded assets', () => {
    it('should abort and delete newly uploaded files when DB save throws', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      // Track newly uploaded file in fallback system
      CloudinaryRecordFallback.track(
        '/Documents/Disclosure/newly-uploaded.pdf',
        {
          sessionId: 'ses-1',
          eventEmitter: mockEventEmitter,
          deleteHandler: (u) => mockUploadsService.deleteFileByUrl(u),
        },
      );

      // Force save failure
      mockSectionModel.mockImplementationOnce(() => ({
        save: jest
          .fn()
          .mockRejectedValue(
            new Error('Database disk full or constraint violation'),
          ),
      }));

      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const dto = {
        sectionKey: 'FAIL_TEST',
        sectionTitle: 'Fail Test Section',
        sessionId: 'ses-1',
        items: [
          {
            srNo: 1,
            title: 'FILE',
            view: { url: '/Documents/Disclosure/newly-uploaded.pdf' },
          },
        ],
      };

      await expect(service.createSection(dto as any)).rejects.toThrow(
        'Database disk full',
      );

      // Compensating cleanup MUST delete newly uploaded file
      expect(mockUploadsService.deleteFileByUrl).toHaveBeenCalledWith(
        '/Documents/Disclosure/newly-uploaded.pdf',
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CLOUDINARY_FALLBACK_EVENTS.FILE_ABORTED,
        expect.objectContaining({ sessionId: 'ses-1' }),
      );
    });
  });

  describe('Scenario 7: Uploading document stages with fallback and user can discard it', () => {
    it('should track uploaded file in CloudinaryRecordFallback and emit staged event', async () => {
      mockUploadsService.upload.mockResolvedValue({
        url: 'https://res.cloudinary.com/test/raw/upload/v1/test.pdf',
        fileUrl: ['https://res.cloudinary.com/test/raw/upload/v1/test.pdf'],
        key: 'test-key',
        provider: 'cloudinary',
      });

      const fakeFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('dummy content'),
      } as any;

      const result = await service.uploadDocument(fakeFile, 'ses-test');
      expect(result.url).toBe(
        'https://res.cloudinary.com/test/raw/upload/v1/test.pdf',
      );

      expect(
        CloudinaryRecordFallback.isStaged(
          'https://res.cloudinary.com/test/raw/upload/v1/test.pdf',
        ),
      ).toBe(true);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CLOUDINARY_FALLBACK_EVENTS.FILE_STAGED,
        expect.objectContaining({
          url: 'https://res.cloudinary.com/test/raw/upload/v1/test.pdf',
          sessionId: 'ses-test',
        }),
      );
    });

    it('should cancel staged upload when explicitly requested by user', async () => {
      CloudinaryRecordFallback.track('/Documents/Disclosure/temp.pdf', {
        sessionId: 'ses-cancel',
        eventEmitter: mockEventEmitter,
      });

      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const res = await service.cancelStagedUpload(
        '/Documents/Disclosure/temp.pdf',
        'ses-cancel',
      );
      expect(res.cancelled).toBe(true);
      expect(mockUploadsService.deleteFileByUrl).toHaveBeenCalledWith(
        '/Documents/Disclosure/temp.pdf',
      );
      expect(
        CloudinaryRecordFallback.isStaged('/Documents/Disclosure/temp.pdf'),
      ).toBe(false);
    });

    it('should refuse to cancel a staged file if already referenced by saved records', async () => {
      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      await expect(
        service.cancelStagedUpload('/Documents/Disclosure/temp.pdf', 'ses-123'),
      ).rejects.toThrow(BadRequestException);

      expect(mockUploadsService.deleteFileByUrl).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 8: Failed updates preserve original record and files', () => {
    it('should not delete original files when update fails', async () => {
      const originalSection = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'DISC-1',
        sectionKey: 'DOCS',
        sectionTitle: 'B. Documents',
        items: [
          {
            srNo: 1,
            title: 'NOC',
            view: { url: '/Documents/Disclosure/original-saved.pdf' },
          },
        ],
      };

      mockSectionModel.findById.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(originalSection) }),
      });
      mockSectionModel.findOne.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(originalSection) }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: () => ({
          exec: jest
            .fn()
            .mockRejectedValue(new Error('Database write collision')),
        }),
      });

      const updateDto = {
        sessionId: 'ses-replace',
        items: [
          {
            srNo: 1,
            title: 'NOC',
            view: { url: '/Documents/Disclosure/replacement-failed.pdf' },
          },
        ],
      };

      await expect(
        service.updateSection('507f1f77bcf86cd799439011', updateDto as any),
      ).rejects.toThrow('Database write collision');

      // Original saved file MUST NOT be deleted
      expect(mockUploadsService.deleteFileByUrl).not.toHaveBeenCalledWith(
        '/Documents/Disclosure/original-saved.pdf',
      );
    });
  });

  describe('Scenario 9: Shared/referenced Cloudinary assets are never deleted', () => {
    it('should refuse to delete a file that is still referenced by another section', async () => {
      const existingSection = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'DISC-1',
        sectionKey: 'SECTION_1',
        sectionTitle: 'Section 1',
        items: [
          {
            srNo: 1,
            title: 'SHARED CERTIFICATE',
            view: { url: '/Documents/Disclosure/shared-cert.pdf' },
          },
        ],
      };

      mockSectionModel.findById.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });
      mockSectionModel.findOne.mockReturnValue({
        lean: () => ({ exec: jest.fn().mockResolvedValue(existingSection) }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({
            ...existingSection,
            items: [
              {
                srNo: 1,
                title: 'SHARED CERTIFICATE',
                view: { url: '/Documents/Disclosure/new-cert.pdf' },
              },
            ],
          }),
        }),
      });

      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const updateDto = {
        items: [
          {
            srNo: 1,
            title: 'SHARED CERTIFICATE',
            view: { url: '/Documents/Disclosure/new-cert.pdf' },
          },
        ],
      };

      await service.updateSection('507f1f77bcf86cd799439011', updateDto);

      expect(mockUploadsService.deleteFileByUrl).not.toHaveBeenCalledWith(
        '/Documents/Disclosure/shared-cert.pdf',
      );
    });
  });

  describe('Scenario 10: Event-based fallback timer purges orphaned files if user never saves record', () => {
    it('should trigger deleteHandler and emit FILE_ORPHANED when timer expires', async () => {
      jest.useFakeTimers();

      const deleteHandler = jest.fn().mockResolvedValue(true);
      const testUrl = 'https://res.cloudinary.com/test/raw/upload/v1/orphan.pdf';

      CloudinaryRecordFallback.track(testUrl, {
        sessionId: 'ses-orphan',
        timeoutMs: 5000,
        eventEmitter: mockEventEmitter,
        deleteHandler,
      });

      expect(CloudinaryRecordFallback.isStaged(testUrl)).toBe(true);

      // Fast forward time past timeout
      jest.advanceTimersByTime(5100);

      expect(deleteHandler).toHaveBeenCalledWith(testUrl);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CLOUDINARY_FALLBACK_EVENTS.FILE_ORPHANED,
        expect.objectContaining({ url: testUrl, sessionId: 'ses-orphan' }),
      );
      expect(CloudinaryRecordFallback.isStaged(testUrl)).toBe(false);

      jest.useRealTimers();
    });

    it('should cancel timer and keep file when record is committed', async () => {
      jest.useFakeTimers();

      const deleteHandler = jest.fn().mockResolvedValue(true);
      const testUrl = 'https://res.cloudinary.com/test/raw/upload/v1/saved.pdf';

      CloudinaryRecordFallback.track(testUrl, {
        sessionId: 'ses-saved',
        timeoutMs: 5000,
        eventEmitter: mockEventEmitter,
        deleteHandler,
      });

      // User saves record -> commit called
      CloudinaryRecordFallback.commit(testUrl, mockEventEmitter);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        CLOUDINARY_FALLBACK_EVENTS.FILE_COMMITTED,
        { urls: [testUrl] },
      );
      expect(CloudinaryRecordFallback.isStaged(testUrl)).toBe(false);

      // Advance timers
      jest.advanceTimersByTime(10000);

      // Deletion handler must NOT be called since file was committed
      expect(deleteHandler).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('Scenario 11: Cloudinary deletion failure handling in cancelStagedUpload', () => {
    it('should throw BadRequestException when storage deletion fails', async () => {
      CloudinaryRecordFallback.track(
        '/Documents/Disclosure/fail-cloud.pdf',
        {
          sessionId: 'ses-999',
          eventEmitter: mockEventEmitter,
        },
      );

      mockSectionModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      mockUploadsService.deleteFileByUrl.mockRejectedValueOnce(
        new Error('Cloudinary rate limit / network timeout'),
      );

      await expect(
        service.cancelStagedUpload(
          '/Documents/Disclosure/fail-cloud.pdf',
          'ses-999',
        ),
      ).rejects.toThrow('Cloudinary deletion failed');
    });
  });

  describe('Scenario 12: Smart sequence de-duplication and serialization (1,2,3... / A,B,C... / I,II,III...)', () => {
    it('should eliminate duplicate numeric serial numbers and serialize as 1, 2, 3...', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionTitle: 'Numbered Section',
        items: [
          { srNo: 1, title: 'Item 1', detail: 'Detail 1' },
          { srNo: 1, title: 'Item 2 with duplicate srNo', detail: 'Detail 2' },
          { srNo: 1, title: 'Item 3 with duplicate srNo', detail: 'Detail 3' },
        ],
      };

      const result = await service.createSection(dto as any);
      expect(result).toBeDefined();
      expect(result.items[0].srNo).toBe(1);
      expect(result.items[1].srNo).toBe(2);
      expect(result.items[2].srNo).toBe(3);
    });

    it('should detect alphabetical sequence and serialize duplicates as A, B, C...', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionTitle: 'Alphabetical Section',
        items: [
          { srNo: 'A', title: 'Clause A', detail: 'Detail A' },
          { srNo: 'A', title: 'Clause B with duplicate', detail: 'Detail B' },
          { srNo: 'C', title: 'Clause C', detail: 'Detail C' },
        ],
      };

      const result = await service.createSection(dto as any);
      expect(result).toBeDefined();
      expect(result.items[0].srNo).toBe('A');
      expect(result.items[1].srNo).toBe('B');
      expect(result.items[2].srNo).toBe('C');
    });

    it('should detect Roman sequence and serialize duplicates as I, II, III...', async () => {
      mockRepository.findBySectionKey.mockResolvedValue(null);

      const dto = {
        sectionTitle: 'Roman Numerals Section',
        items: [
          { srNo: 'I', title: 'Part I', detail: 'Detail I' },
          { srNo: 'I', title: 'Part II with duplicate', detail: 'Detail II' },
          { srNo: 'III', title: 'Part III', detail: 'Detail III' },
        ],
      };

      const result = await service.createSection(dto as any);
      expect(result).toBeDefined();
      expect(result.items[0].srNo).toBe('I');
      expect(result.items[1].srNo).toBe('II');
      expect(result.items[2].srNo).toBe('III');
    });
  });

  describe('Scenario 13: Updating sections with optional view URLs', () => {
    it('should allow updating items when some items have empty view url or view is null', async () => {
      const existingSection = {
        _id: '507f1f77bcf86cd799439011',
        publicId: 'DISC-SEC-1',
        sectionKey: 'DOCS_INFO',
        sectionTitle: 'B. Documents and Information',
        items: [
          { srNo: 1, title: 'Item 1', view: null },
          { srNo: 2, title: 'Item 2', view: { url: '' } },
          { srNo: 3, title: 'Item 3', view: { label: 'VIEW', url: '/docs/actual.pdf' } },
        ],
      };

      mockSectionModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(existingSection),
        }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...existingSection,
            items: [
              { srNo: 1, title: 'Item 1', view: null },
              { srNo: 2, title: 'Item 2', view: null },
              { srNo: 3, title: 'Item 3', view: { label: 'VIEW', url: '/docs/actual.pdf' } },
            ],
          }),
        }),
      });

      const updateDto = {
        items: [
          { srNo: 1, title: 'Item 1 updated', view: null },
          { srNo: 2, title: 'Item 2 updated', view: { url: '' } },
          { srNo: 3, title: 'Item 3', view: { url: '/docs/actual.pdf' } },
        ],
      };

      const result = await service.updateSection('507f1f77bcf86cd799439011', updateDto as any);
      expect(result).toBeDefined();
      expect(result.items[0].view).toBeNull();
      expect(result.items[1].view).toBeNull();
      expect(result.items[2].view?.url).toBe('/docs/actual.pdf');
    });
  });

  describe('Scenario 14: Unified cross-section sequence context synchronization', () => {
    it('should automatically synchronize other sections when one section adopts a sequence style', async () => {
      const sectionToUpdate = {
        _id: '507f1f77bcf86cd799439011',
        sectionKey: 'SEC_A',
        sectionTitle: 'A. Section',
        items: [{ srNo: 1, title: 'Item 1' }],
      };

      const otherSection = {
        _id: '507f1f77bcf86cd799439022',
        sectionKey: 'SEC_B',
        sectionTitle: 'B. Section',
        items: [{ srNo: 1, title: 'Old Numbered 1' }, { srNo: 2, title: 'Old Numbered 2' }],
        save: jest.fn().mockResolvedValue(true),
      };

      mockSectionModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sectionToUpdate),
        }),
      });

      mockSectionModel.findOneAndUpdate.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...sectionToUpdate,
            items: [{ srNo: 'A', title: 'Item 1' }],
          }),
        }),
      });

      mockSectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([otherSection]),
      });

      // Update section A with alphabetical sequence
      await service.updateSection('507f1f77bcf86cd799439011', {
        items: [{ srNo: 'A', title: 'Item 1' }],
      } as any);

      // Verify that other section was automatically re-serialized to A, B... and saved
      expect(otherSection.save).toHaveBeenCalled();
      expect(otherSection.items[0].srNo).toBe('A');
      expect(otherSection.items[1].srNo).toBe('B');
    });

    it('should synchronize all sections via syncAllSectionsSequenceStyle', async () => {
      const sec1 = {
        items: [{ srNo: 'A', title: 'Item A' }, { srNo: 'B', title: 'Item B' }],
        save: jest.fn().mockResolvedValue(true),
      };
      const sec2 = {
        items: [{ srNo: 'X', title: 'Item X' }],
        save: jest.fn().mockResolvedValue(true),
      };

      mockSectionModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([sec1, sec2]),
      });
      mockRepository.findAllOrdered.mockResolvedValue([sec1, sec2] as any);

      await service.syncAllSectionsSequenceStyle('NUMERIC');

      expect(sec1.items[0].srNo).toBe(1);
      expect(sec1.items[1].srNo).toBe(2);
      expect(sec2.items[0].srNo).toBe(1);
    });
  });
});

