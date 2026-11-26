export default () => {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
    'ctpyyyuj';

  const rootFolder = process.env.CLOUDINARY_ROOT_FOLDER ?? 'ips-education/assets';
  const mediaBaseUrl = process.env.MEDIA_BASE_URL ?? `https://res.cloudinary.com/${cloudName}`;

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: parseInt(process.env.PORT ?? '5000', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api',
    mongodbUri:
      process.env.MONGODB_URI ??
      'mongodb://127.0.0.1:27017/ips_db',
    jwt: {
      secret: process.env.JWT_SECRET ?? 'super_secret_ips_admin_jwt_token_key_2026',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    },
    admin: {
      email: process.env.DEFAULT_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? 'admin.ips@gmail.com',
      password: process.env.DEFAULT_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? 'Admin@Ips',
    },
    corsOrigins: process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? '*',
    cloudinary: {
      cloudName,
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
      rootFolder,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET ?? '',
      mediaBaseUrl,
    },
    youtube: {
      channelHandle: process.env.YOUTUBE_CHANNEL_HANDLE ?? '',
      channelId: process.env.YOUTUBE_CHANNEL_ID ?? '',
      apiKey: process.env.YOUTUBE_API_KEY ?? '',
    },
    swagger: {
      enabled: process.env.ENABLE_SWAGGER !== 'false',
    },

    // Backward-compatibility flat aliases
    MONGODB_URI:
      process.env.MONGODB_URI ??
      'mongodb://127.0.0.1:27017/ips_db',
    JWT_SECRET: process.env.JWT_SECRET ?? 'super_secret_ips_admin_jwt_token_key_2026',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '7d',
    CORS_ORIGINS: process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? '*',
    CLOUDINARY_CLOUD_NAME: cloudName,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY ?? '',
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET ?? '',
    CLOUDINARY_ROOT_FOLDER: rootFolder,
    MEDIA_BASE_URL: mediaBaseUrl,
    YOUTUBE_CHANNEL_HANDLE: process.env.YOUTUBE_CHANNEL_HANDLE ?? '',
    YOUTUBE_CHANNEL_ID: process.env.YOUTUBE_CHANNEL_ID ?? '',
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ?? '',
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER ?? 'true',
  };
};
