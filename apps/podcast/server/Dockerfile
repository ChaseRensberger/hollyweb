FROM golang:1.25.4-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o hollyweb-podcast-server .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/hollyweb-podcast-server .
EXPOSE 1323
CMD ["./hollyweb-podcast-server"]
