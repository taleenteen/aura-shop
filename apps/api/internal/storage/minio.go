package storage

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type MinIOClient struct {
	client    *minio.Client
	bucket    string
	publicURL string
}

func NewMinIOClient(endpoint, accessKey, secretKey, bucket, publicURL string, useSSL bool) (*MinIOClient, error) {
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create minio client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		slog.Warn("minio bucket check warning (will proceed if minio is provisioning)", "bucket", bucket, "error", err)
	} else if !exists {
		err = client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		if err != nil {
			slog.Warn("could not auto-create minio bucket, might be handled by minio-init", "bucket", bucket, "error", err)
		} else {
			slog.Info("created minio bucket successfully", "bucket", bucket)
		}
	}

	slog.Info("minio storage client initialized", "endpoint", endpoint, "bucket", bucket)
	return &MinIOClient{
		client:    client,
		bucket:    bucket,
		publicURL: publicURL,
	}, nil
}

func (m *MinIOClient) GeneratePresignedUploadURL(ctx context.Context, objectName string, expiry time.Duration) (string, error) {
	presignedURL, err := m.client.PresignedPutObject(ctx, m.bucket, objectName, expiry)
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned upload url: %w", err)
	}
	return presignedURL.String(), nil
}

func (m *MinIOClient) GetPublicAssetURL(objectName string) string {
	escapedName := url.PathEscape(objectName)
	return fmt.Sprintf("%s/%s", m.publicURL, escapedName)
}

func (m *MinIOClient) Client() *minio.Client {
	return m.client
}

func (m *MinIOClient) Bucket() string {
	return m.bucket
}
