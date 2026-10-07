import React from 'react';
import type { User } from '../types';

// Production note:
// Full DMS integrity checks read several large collections. They are intentionally
// not executed on page load anymore. Run diagnostics explicitly from the
// diagnostics/integrity panel when needed.
const DmsIntegrityAutoRunner:React.FC<{user:User;companyId:string;storeId:string}>=()=>null;

export default DmsIntegrityAutoRunner;
