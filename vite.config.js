import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {createApplication} from './server/application.js';
import {fileURLToPath} from 'node:url';
const application=createApplication({directory:process.env.DATA_DIR||fileURLToPath(new URL('./.local/',import.meta.url))});
const localDataAPI={name:'zhiheng-local-data-api',configureServer(server){server.middlewares.use(application.handle)},configurePreviewServer(server){server.middlewares.use(application.handle)}};
export default defineConfig({optimizeDeps:{include:['read-excel-file/browser']},plugins:[tailwindcss(),localDataAPI]});
