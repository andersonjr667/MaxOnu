const { v2: cloudinary } = require('cloudinary');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.CLAUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY || process.env.CLAUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLAUDINARY_API_SECRET;

const hasCloudinaryConfig = Boolean(
    cloudName &&
    apiKey &&
    apiSecret
);

if (hasCloudinaryConfig) {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true
    });
}

function uploadImageBuffer(buffer, options = {}) {
    if (!hasCloudinaryConfig) {
        return Promise.reject(new Error('Cloudinary não configurado no ambiente.'));
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'maxonu/posts',
                resource_type: 'image',
                ...options
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result);
            }
        );

        stream.end(buffer);
    });
}

function uploadBuffer(buffer, options = {}) {
    if (!hasCloudinaryConfig) {
        return Promise.reject(new Error('Cloudinary não configurado no ambiente.'));
    }

    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: 'maxonu/uploads',
                resource_type: 'auto',
                ...options
            },
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result);
            }
        );

        stream.end(buffer);
    });
}

function destroyAsset(publicId, options = {}) {
    if (!hasCloudinaryConfig || !publicId) {
        return Promise.resolve(null);
    }

    return cloudinary.uploader.destroy(publicId, options);
}

module.exports = {
    hasCloudinaryConfig,
    uploadImageBuffer,
    uploadBuffer,
    destroyAsset
};
