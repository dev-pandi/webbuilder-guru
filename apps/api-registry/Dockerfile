FROM golang:1.25-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git
COPY go.mod go.sum* ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api-registry ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /out/api-registry /app/api-registry
EXPOSE 5000
ENTRYPOINT ["/app/api-registry"]
