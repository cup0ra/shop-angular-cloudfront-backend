import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUiDist from 'swagger-ui-dist';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(projectRoot, 'docs');
const swaggerUiRoot = swaggerUiDist.getAbsoluteFSPath();
const port = Number(process.env.SWAGGER_UI_PORT ?? 8081);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.yaml': 'application/yaml; charset=utf-8',
  '.yml': 'application/yaml; charset=utf-8',
};

function getContentType(filePath) {
  return contentTypes[path.extname(filePath)] ?? 'application/octet-stream';
}

function resolveRequestPath(urlPath) {
  if (urlPath === '/') {
    return path.join(docsRoot, 'swagger-ui.html');
  }

  if (urlPath.startsWith('/docs/')) {
    return path.join(projectRoot, urlPath);
  }

  if (urlPath.startsWith('/swagger-ui/')) {
    return path.join(swaggerUiRoot, urlPath.replace('/swagger-ui/', ''));
  }

  return null;
}

const server = createServer(async (request, response) => {
  const urlPath = request.url?.split('?')[0] ?? '/';
  const filePath = resolveRequestPath(urlPath);

  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, { 'Content-Type': getContentType(filePath) });
  createReadStream(filePath).pipe(response);
});

function logServerAddress() {
  const address = server.address();

  if (!address || typeof address === 'string') {
    console.log('Swagger UI started.');
    return;
  }

  console.log(`Swagger UI available at http://localhost:${address.port}`);
}

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.warn(`Port ${port} is already in use. Trying a free port instead.`);
    server.listen(0, logServerAddress);
    return;
  }

  throw error;
});

server.listen(port, logServerAddress);