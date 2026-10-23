/**
 * 來源註冊表。每個模組就是一個資料來源，介面見 README.md。
 * 順序不重要（runner 依 dependsOn 排序），但同層級會照這裡的順序跑。
 */
import * as medical from './medical.mjs';
import * as housePrice from './house-price.mjs';
import * as farmland from './farmland.mjs';
import * as population from './population.mjs';
import * as populationChange from './population-change.mjs';
import * as care from './care.mjs';
import * as fiscal from './fiscal.mjs';
import * as electricity from './electricity.mjs';
import * as income from './income.mjs';
import * as legacy from './legacy.mjs';

// 這個順序＝指標在畫面上的順序（醫療→房價→農地→人口→長照→所得→財政→用電→產業教育）
export const sources = [medical, housePrice, farmland, population, populationChange, care, income, fiscal, electricity, legacy];
