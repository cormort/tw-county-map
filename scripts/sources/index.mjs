/**
 * 來源註冊表。每個模組就是一個資料來源，介面見 README.md。
 * 順序不重要（runner 依 dependsOn 排序），但同層級會照這裡的順序跑。
 */
import * as medical from './medical.mjs';
import * as housePrice from './house-price.mjs';
import * as farmland from './farmland.mjs';
import * as legacy from './legacy.mjs';

export const sources = [medical, housePrice, farmland, legacy];
