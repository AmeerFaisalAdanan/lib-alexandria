# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3
RUN adduser -D -u 1001 app
WORKDIR /app
COPY --from=build /out/server /app/server
# Fixture catalogue is for development only; the server refuses CATALOGUE_SOURCE=fixture when APP_ENV=production.
COPY fixtures ./fixtures
USER app
EXPOSE 8081
CMD ["/app/server"]
