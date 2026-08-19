FROM nginx:1.28-alpine AS common

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d/upstream.conf /etc/nginx/conf.d/upstream.conf
COPY snippets/ /etc/nginx/snippets/

FROM common AS http
COPY templates-http/ /etc/nginx/templates/

FROM common AS tls
COPY templates-tls/ /etc/nginx/templates/
