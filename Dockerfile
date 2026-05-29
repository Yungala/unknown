# syntax=docker/dockerfile:1.7

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

ENV PNPM_HOME=/usr/local/bin
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# 의존성 캐시 레이어
COPY package.json pnpm-lock.yaml* ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 소스 복사 + 빌드
COPY . .

# 빌드 타임 env (VITE_* 만 클라이언트에 포함됨)
ARG VITE_APP_NAME
ARG VITE_API_BASE_URL
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm build


# ---------- Stage 2: runtime (nginx) ----------
FROM nginx:1.27-alpine AS runtime

# 비루트 운영 + 보안 패치
RUN apk add --no-cache curl tini \
    && rm -rf /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/app.conf
COPY --from=builder /app/dist /usr/share/nginx/html

# 헬스체크용 정적 파일
RUN printf 'ok\n' > /usr/share/nginx/html/healthz

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["nginx", "-g", "daemon off;"]
