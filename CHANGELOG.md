# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Response metadata: pass `includeMeta: true` in `RequestOptions` to receive `{ data, meta }` with diagnostic headers (`X-Request-ID`, `X-Correlation-ID`, `Traceparent`), HTTP status, and duration.
- `GuildPassError.requestMeta` carries diagnostic metadata for HTTP errors, enabling correlation with backend logs and support tickets.
- Made the main logo clickable, directing to the root README.md file
- Fixed logo display by using the local logo file instead of an external URL
