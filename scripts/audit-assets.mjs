import {auditAssets} from '../src/assets.mjs';
const report=auditAssets();console.log(JSON.stringify(report,null,2));if(!report.ok)process.exit(1);
