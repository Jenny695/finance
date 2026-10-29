import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createAuth} from '../server/auth.js';
if(existsSync('.env'))process.loadEnvFile('.env');
if(!process.env.ADMIN_USERNAME||!process.env.ADMIN_PASSWORD){console.error('请在.env中设置ADMIN_USERNAME和ADMIN_PASSWORD，然后重新运行。');process.exit(1)}
const auth=createAuth({directory:process.env.DATA_DIR||resolve('.local')});
try{await auth.bootstrap(process.env.ADMIN_USERNAME,process.env.ADMIN_PASSWORD);console.log('管理员账户已准备就绪：'+process.env.ADMIN_USERNAME)}finally{auth.close()}
