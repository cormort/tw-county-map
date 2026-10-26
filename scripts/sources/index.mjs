/**
 * 來源註冊表。每個模組就是一個資料來源，介面見 README.md。
 *
 * 陣列順序＝指標在畫面上的順序（醫療→房價→農地→人口→長照→所得→財政→用電→產業→教育→趨勢）；
 * 實際執行順序由 dependsOn 決定，兩者不必相同。
 */
import * as medical from './medical.mjs';
import * as housePrice from './house-price.mjs';
import * as farmland from './farmland.mjs';
import * as population from './population.mjs';
import * as populationChange from './population-change.mjs';
import * as care from './care.mjs';
import * as income from './income.mjs';
import * as fiscal from './fiscal.mjs';
import * as electricity from './electricity.mjs';
import * as solar from './solar.mjs';
import * as environment from './environment.mjs';
import * as business from './business.mjs';
import * as factories from './factories.mjs';
import * as labor from './labor.mjs';
import * as pension from './pension.mjs';
import * as healthInsurance from './health-insurance.mjs';
import * as indigenous from './indigenous.mjs';
import * as education from './education.mjs';
import * as populationTrends from './population-trends.mjs';
import * as taxIncome from './tax-income.mjs';
import * as vehicles from './vehicles.mjs';

export const sources = [
  medical, housePrice, farmland, population, populationChange, care, income, taxIncome, fiscal, electricity,
  solar, environment, vehicles, business, factories, labor, pension, healthInsurance, indigenous, education, populationTrends,
];
