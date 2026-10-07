import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  transformMediaUrlsToRelative,
  transformMediaPathsToFull,
} from '../config';

export interface ResponseFormat<T> {
  statusCode: number;
  status: number;
  success: boolean;
  message: string;
  data: T;
  meta: Record<string, unknown> | null;
  timestamp: string;
}

function serializeResponse(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Stop excessive recursion
  if (depth > 15) return value;

  if (value instanceof Date) return value.toISOString();

  // Handle Mongoose ObjectId
  if (
    typeof (value as any).toHexString === 'function' ||
    (value as any)._bsontype === 'ObjectID' ||
    (value as any).constructor?.name === 'ObjectId'
  ) {
    return String(value);
  }

  // Handle Buffers
  if (Buffer.isBuffer(value)) {
    return '[Buffer]';
  }

  // Prevent circular references
  if (seen.has(value as object)) {
    return '[Circular]';
  }
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => serializeResponse(item, seen, depth + 1));
  }

  const document = value as {
    toObject?: (options?: any) => Record<string, unknown>;
  };

  const rawObj =
    typeof document.toObject === 'function'
      ? document.toObject({ getters: true, virtuals: true })
      : (value as Record<string, unknown>);

  const result: Record<string, unknown> = {};

  if (rawObj._id) {
    result._id = String(rawObj._id);
  }
  if (!result.id) {
    if (rawObj._id) {
      result.id = String(rawObj._id);
    } else if (rawObj.menuId) {
      result.id = String(rawObj.menuId);
    }
  }
  if (rawObj.publicId) {
    result.id = String(rawObj.publicId);
  }

  for (const [key, child] of Object.entries(rawObj)) {
    if (key === '__v' || key === '$__' || key === '_doc') continue;
    if (key === 'publicId' && rawObj.publicId) continue;
    result[key] = serializeResponse(child, seen, depth + 1);
  }

  return result;
}

function getResponseData(value: Record<string, unknown>) {
  if (!Array.isArray(value.items)) {
    return { data: value, meta: null };
  }

  const { items, ...meta } = value;
  return { data: items, meta };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ResponseFormat<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ResponseFormat<T>> {
    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<{ statusCode?: number }>();
    const request = httpContext.getRequest<{ method: string; body?: any }>();

    // Request time: transform incoming payload to relative media paths
    if (request && request.body && typeof request.body === 'object') {
      request.body = transformMediaUrlsToRelative(request.body);
    }

    const statusCode = response.statusCode ?? HttpStatus.OK;
    const method = request.method;
    const messageByMethod: Record<string, string> = {
      GET: 'Record fetched successfully',
      POST: 'Record created successfully',
      PUT: 'Record updated successfully',
      PATCH: 'Record updated successfully',
      DELETE: 'Record deleted successfully',
    };

    return next.handle().pipe(
      map((data) => {
        const serializedData = serializeResponse(data);
        const responseData =
          serializedData && typeof serializedData === 'object'
            ? getResponseData(serializedData as Record<string, unknown>)
            : { data: serializedData, meta: null };

        // Response time: attach prefix to relative media paths
        const transformedData = transformMediaPathsToFull(responseData.data);

        return {
          statusCode,
          status: statusCode,
          success: true,
          message:
            messageByMethod[method] ?? 'Operation completed successfully',
          data: transformedData as T,
          meta: responseData.meta,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}


