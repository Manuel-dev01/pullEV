# Build the PullEV engine — static binary, fixtures embedded via go:embed.
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod ./
# (no external deps yet; copy go.sum when one appears)
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/engine .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/engine /engine
# Railway/Render inject PORT; default 8080. Set WEB_ORIGIN to the Vercel URL in prod.
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/engine"]
