/**
 * 每個指標的「定義」（怎麼算、算的是什麼）與「白話意義」（這個數字在說什麼）。
 * 網站（指標選單下方、縣市總覽卡片）與 DATA_SOURCES.md 都從這裡來；新增指標時一起補。
 * 選舉指標的 key 是「選舉.政黨.欄位」，用 noteFor() 依欄位對應。
 */
export const METRIC_NOTES: Record<string, { definition: string; meaning: string }> = {
  // 人口（counties.json）
  population: { definition: '戶籍登記人口數（最新月份）', meaning: '設籍在這個縣市的人數；實際住在這裡的人可能更多或更少（例如外地上班、求學沒遷戶籍）。' },
  households: { definition: '戶籍登記的戶數', meaning: '有幾個「戶」；人口 ÷ 戶數＝平均每戶幾個人，越小代表小家庭、獨居越多。' },
  voting_age: { definition: '20 歲以上的戶籍人口', meaning: '大致等於有投票權的人數（實際選舉人數另依中選會公告）。' },
  elderly: { definition: '65 歲以上的戶籍人口', meaning: '長者人數，關係到長照、醫療與敬老福利的規模。' },
  area_km2: { definition: '縣市所有鄉鎮市區面積加總（平方公里）', meaning: '土地有多大；跟人口一起看就是人口密度。' },
  voting_age_ratio: { definition: '20 歲以上人口 ÷ 總人口 × 100', meaning: '有投票權的人占多少；越高代表成年人口比例越大。' },
  elderly_ratio: { definition: '65 歲以上人口 ÷ 總人口 × 100', meaning: '老人占多少。超過 14% 稱「高齡社會」，超過 20% 稱「超高齡社會」。' },
  density: { definition: '人口數 ÷ 土地面積（平方公里）', meaning: '每平方公里住幾個人；越高越擁擠、越都市化。' },
  // 人口結構（county-stats.json）
  male: { definition: '男性戶籍人口', meaning: '男性人數。' },
  female: { definition: '女性戶籍人口', meaning: '女性人數。' },
  age_preschool: { definition: '0–5 歲戶籍人口', meaning: '幼兒人數，對應托嬰中心、幼兒園的需求量。' },
  age_primary: { definition: '6–11 歲戶籍人口（實際年齡，不是學籍人數）', meaning: '國小學齡兒童人數。' },
  age_junior: { definition: '12–14 歲戶籍人口', meaning: '國中學齡人數。' },
  age_senior: { definition: '15–17 歲戶籍人口', meaning: '高中職學齡人數。' },
  age_college: { definition: '18–21 歲戶籍人口', meaning: '大學學齡人數。' },
  births: { definition: '近 12 個月的出生登記數', meaning: '一年生了幾個小孩。' },
  deaths: { definition: '近 12 個月的死亡登記數', meaning: '一年有幾人過世。' },
  natural_increase: { definition: '出生數 － 死亡數（近 12 個月）', meaning: '不算搬家，只看生與死，人口自然多了或少了幾人；負值代表過世的人比出生的多。' },
  new_residents: { definition: '外籍配偶＋大陸港澳配偶的累計人數（移民署）', meaning: '因婚姻移入的新住民人數。' },
  foreign_spouses: { definition: '外籍配偶累計人數（越南、印尼、泰國、菲律賓等）', meaning: '來自中國大陸、港澳以外國家的婚姻移民人數。' },
  mainland_spouses: { definition: '大陸配偶＋港澳配偶累計人數', meaning: '來自中國大陸、港澳的婚姻移民人數。' },
  pop_growth: { definition: '今年同月人口 － 去年同月人口', meaning: '一年來人口增加或減少了幾人；正值變多、負值變少。' },
  net_migration: { definition: '一年人口增減 －（出生 － 死亡）', meaning: '扣掉生與死之後，搬進來比搬出去多了（正）或少了（負）幾人。' },
  sex_ratio: { definition: '男性人口 ÷ 女性人口 × 100', meaning: '每 100 位女性對應幾位男性。大於 100 是男多女少（外島、軍營多的地方常見）；高齡化的地方女性長壽，通常低於 100。' },
  age_preschool_ratio: { definition: '0–5 歲人口 ÷ 總人口 × 100', meaning: '幼兒占多少，用來估托嬰、幼兒園的需求。' },
  age_primary_ratio: { definition: '6–11 歲人口 ÷ 總人口 × 100', meaning: '國小學齡兒童占多少，反映國小的班級與師資需求。' },
  age_junior_ratio: { definition: '12–14 歲人口 ÷ 總人口 × 100', meaning: '國中學齡人口占多少。' },
  age_senior_ratio: { definition: '15–17 歲人口 ÷ 總人口 × 100', meaning: '高中職學齡人口占多少。' },
  age_college_ratio: { definition: '18–21 歲人口 ÷ 總人口 × 100', meaning: '大學學齡人口占多少；跟在地大學的招生來源有關。' },
  old_dependency: { definition: '65 歲以上人口 ÷ 15–64 歲人口 × 100', meaning: '每 100 位工作年齡的人要扶養幾位老人；越高，照顧與財政負擔越重。' },
  young_dependency: { definition: '0–14 歲人口 ÷ 15–64 歲人口 × 100', meaning: '每 100 位工作年齡的人要扶養幾位小孩。' },
  primary_outlook: { definition: '（現在 0–5 歲人數 － 現在 6–11 歲人數）÷ 現在 6–11 歲人數 × 100', meaning: '用現在的幼兒推估 6 年後國小學生會比現在多或少幾成；負值代表學校要準備減班。粗估，沒扣死亡與遷徙。' },
  birth_rate: { definition: '近 12 個月出生數 ÷ 人口 × 1,000（‰，千分比）', meaning: '每 1,000 人一年生幾個小孩；越低代表少子化越嚴重。' },
  death_rate: { definition: '近 12 個月死亡數 ÷ 人口 × 1,000（‰）', meaning: '每 1,000 人一年有幾人過世；人口越老通常越高。' },
  new_residents_per1000: { definition: '新住民（外籍＋大陸港澳配偶累計人數）÷ 人口 × 1,000', meaning: '每 1,000 人中有幾位婚姻移民，用來看語言、托育、就業等新住民服務的需求。' },
  pop_growth_rate: { definition: '（今年同月人口 － 去年同月人口）÷ 去年同月人口 × 100', meaning: '一年來人口變多還是變少。' },
  net_migration_rate: { definition: '淨遷入人數 ÷ 去年同月人口 × 1,000；淨遷入 ＝ 人口增減 －（出生 － 死亡）', meaning: '扣掉出生、死亡之後，搬進來的人比搬出去的多還是少；正值代表這個地方吸引人移入。' },
  aging_speed: { definition: '今年 65 歲以上比率 － 去年同月 65 歲以上比率（百分點）', meaning: '老化的速度：一年內老人比例增加了幾個百分點。' },
  indigenous: { definition: '戶籍登記為原住民身分（平地＋山地原住民）的人數', meaning: '原住民族人口有多少。' },
  indigenous_ratio: { definition: '原住民人口 ÷ 總人口 × 100', meaning: '原住民族占人口幾 %，關係到原住民族教育、文化與就業政策的服務對象。' },
  // 教育
  schools_kindergarten: { definition: '幼兒園家數（公立＋私立，最新學年度）', meaning: '能送托的幼兒園有幾家。' },
  schools_primary: { definition: '國民小學校數（公立＋私立，最新學年度）', meaning: '國小有幾所。' },
  schools_junior: { definition: '國民中學校數（最新學年度；完全中學、國中小的國中部也算）', meaning: '國中有幾所。' },
  schools_senior: { definition: '一般高級中等學校校數（不含技術型高中、進修學校）', meaning: '普通高中有幾所。' },
  schools_college: { definition: '大專校院校數（大學、科技大學、專科）', meaning: '大學與專科有幾所，看高等教育資源與年輕人口吸引力。' },
  pupils_per_primary_school: { definition: '6–11 歲人口 ÷ 國小校數', meaning: '平均每所國小分到幾個學齡兒童；數字小代表小校多，可能面臨併校、減班。' },
  // 產業與就業
  companies: { definition: '公司登記現有家數（有限公司、股份有限公司等）', meaning: '登記在這裡的公司有幾家；總公司常集中在大都市。' },
  companies_per1000: { definition: '公司家數 ÷ 人口 × 1,000', meaning: '每 1,000 人有幾家公司，看商業活動密度。' },
  company_capital: { definition: '公司實收資本額加總（百萬元）', meaning: '登記在這裡的公司資本規模；大企業總部所在地會特別高。' },
  businesses: { definition: '商業登記（獨資、合夥的行號）現有家數', meaning: '小店家、個人商號有幾家，反映在地小生意的數量。' },
  businesses_per1000: { definition: '商業登記家數 ÷ 人口 × 1,000', meaning: '每 1,000 人有幾家行號。' },
  factories: { definition: '工廠登記狀態為「生產中」的工廠家數', meaning: '有在營運的登記工廠有幾家；未登記工廠不在內。' },
  factories_per10k: { definition: '生產中工廠家數 ÷ 人口 × 10,000', meaning: '每 1 萬人有幾家工廠，看製造業的密度。' },
  labor_insured: { definition: '勞保投保人數（月底），依投保單位所在地', meaning: '在這裡投保勞保的人數；依公司或工會所在地計，總公司多的都市會偏高，不完全等於住在這裡的勞工。' },
  labor_insured_per1000: { definition: '勞保投保人數 ÷ 人口 × 1,000', meaning: '每 1,000 人對應幾個勞保投保人次；大於人口中工作年齡比例很多時，代表有大量外地人在這裡上班投保。' },
  // 醫療與長照
  institutions: { definition: '醫院＋診所的家數（西醫、中醫、牙醫都算）', meaning: '看病的地方有幾家。' },
  hospitals: { definition: '醫院家數', meaning: '可以住院、急診的大型醫療機構數量。' },
  clinics: { definition: '診所家數（醫療院所 － 醫院）', meaning: '社區看小病的地方有幾家。' },
  beds: { definition: '醫院與診所的病床總數', meaning: '能同時收住院病人的量能。' },
  physicians: { definition: '在醫療院所執業的西醫師人數', meaning: '西醫醫師有幾位。' },
  doctors_all: { definition: '西醫師＋中醫師＋牙醫師的執業人數', meaning: '所有醫師加起來有幾位。' },
  ltc_points: { definition: '長照 ABC 據點數（依機構代碼去重）', meaning: '長照服務點有幾個（A 個管、B 服務提供、C 巷弄站）。' },
  institutions_per10k: { definition: '醫療院所家數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人分到幾家醫院或診所；越高代表看病的地方越多、越近。' },
  beds_per10k: { definition: '病床數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人有幾張病床，反映住院量能；數字低的地方，重症或住院可能要跨縣市。' },
  physicians_per10k: { definition: '西醫師數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人有幾位西醫師；越少，掛號越難、等越久。' },
  doctors_all_per10k: { definition: '（西醫師＋中醫師＋牙醫師）÷ 年底人口 × 10,000', meaning: '所有醫師加起來的密度，看整體醫療人力。' },
  ltc_per1000_elderly: { definition: '長照 ABC 據點數 ÷ 65 歲以上人口 × 1,000', meaning: '每 1,000 位長者附近有幾個長照服務點；越高，長輩越容易找到日照、居家服務等資源。' },
  // 房價
  house_deals: { definition: '近四季申報的房屋買賣件數（含建物的交易，不含純土地、純車位）', meaning: '一年賣了幾間房子。' },
  house_price: { definition: '住宅成交每坪單價由低到高排序後，正中間那一筆', meaning: '一半的房子比這個貴、一半比這個便宜；用中位數是因為不會被少數豪宅拉高。' },
  house_deals_per10k: { definition: '近四季房屋買賣件數 ÷ 人口 × 10,000', meaning: '房市熱不熱：每 1 萬人一年內有幾筆房屋買賣。' },
  price_to_income: { definition: '住宅成交總價中位數 ÷ 平均每戶可支配所得', meaning: '一般家庭不吃不喝幾年才買得起一間中間價位的房子；越高越難買。官方用所得中位數，這裡用平均數，所以會偏低一些。' },
  // 經濟
  income: { definition: '家庭收支調查的平均每戶可支配所得（所得總額扣掉稅、社會保險等非消費支出）', meaning: '一般家庭一年真正能拿來花或存的錢；是平均數，會被高所得家庭拉高。' },
  unemployment: { definition: '失業人數 ÷ 勞動力 × 100（勞動力＝15 歲以上有工作或正在找工作的人）', meaning: '想工作的人之中，有幾 % 找不到工作。' },
  // 能源
  elec_total: { definition: '近 12 個月住宅、服務業、工業、農林漁牧四類售電量加總（百萬度；1 度＝1 千瓦小時）', meaning: '整個縣市一年用掉多少電；工業多的縣市會特別高。' },
  elec_per_capita: { definition: '近 12 個月總用電量 ÷ 人口', meaning: '平均每人分到的用電量；包含工廠、商店用電，所以工業縣市會偏高，不等於家裡用多少電。' },
  elec_residential_per_capita: { definition: '近 12 個月住宅用電量 ÷ 人口', meaning: '平均每人在家裡用多少電；跟氣候（冷氣）、家戶人數、生活型態有關。' },
  elec_industry_share: { definition: '工業用電 ÷ 總用電量 × 100', meaning: '用電有幾成是工廠用的，看這個縣市的產業結構偏不偏工業。' },
  elec_growth: { definition: '（近 12 個月總用電 － 前 12 個月總用電）÷ 前 12 個月總用電 × 100', meaning: '用電量一年來成長還是衰退；常跟產業擴張或景氣有關。' },
  // 財政
  own_revenue_ratio: { definition: '（歲入 － 中央補助及協助收入）÷ 歲入 × 100', meaning: '縣市自己收來的錢（稅、規費等）占總收入多少；越高越不依賴中央補助。' },
  expenditure_per_capita: { definition: '歲出決算 ÷ 人口', meaning: '平均花在每位居民身上的預算；地廣人稀或離島通常偏高。' },
  debt: { definition: '縣市政府公共債務餘額（1 年以上＋未滿 1 年，百萬元）', meaning: '縣市政府總共欠多少錢。' },
  debt_per_capita: { definition: '公共債務餘額 ÷ 人口', meaning: '平均每位居民背了多少縣市政府的債。' },
  // 農業
  farmland: { definition: '水稻、其他短期作物、休閒地、長期耕作地、長期休閒地的面積加總（公頃）', meaning: '可以耕種的土地有多少（含暫時休耕）。' },
  farmland_ratio: { definition: '耕地面積 ÷ 縣市土地面積 × 100', meaning: '縣市的土地有多少比例在種田，看農業在土地利用上的份量。' },
};

/** 選舉指標（key 形如 president_2024.民主進步黨.pct）依最後一段欄位對應 */
const ELECTION_NOTES: Record<string, { definition: string; meaning: string }> = {
  pct: { definition: '該政黨候選人得票數 ÷ 有效票數 × 100', meaning: '投給這個政黨的人占有效票多少。' },
  margin_pct: { definition: '第一名得票率 － 第二名得票率（百分點）', meaning: '贏多少：數字越小，代表選得越接近、越有變數。' },
  turnout: { definition: '投票人數 ÷ 選舉人數 × 100', meaning: '有投票權的人裡，有多少人真的去投票。' },
  votes: { definition: '該政黨候選人在這個縣市的得票數加總', meaning: '這個政黨在這裡拿到幾票。' },
  margin: { definition: '第一名得票數 － 第二名得票數', meaning: '第一名贏了幾票；跟領先幅度（百分點）一起看，才知道在大縣市還是小縣市贏的。' },
};

/** 「時間差異」分頁與縣市總覽的比較方式 */
export const COMPARE_NOTES = {
  diff: { definition: '最近一次的值 － 前一次的值（比率類指標的差異單位是「百分點」）', meaning: '數字本身變多或變少了多少。' },
  rate: { definition: '（最近一次 － 前一次）÷ 前一次 × 100', meaning: '跟自己比變了幾成；小縣市的數字小，看變化率才比得出誰變得多。比率類指標（如得票率）的變化率是「相對變化」，例如得票率從 40% 變 44% 是增加 4 個百分點、變化率 +10%。' },
  rank: { definition: '22 個縣市依數值由大到小排序的名次（沒有資料的縣市不算）', meaning: '「第 1 高」只是數字最大，不一定是好事，例如失業率、死亡率。' },
  vsNational: { definition: '比率類跟全國值（沒有全國值時用 22 縣市平均）比；人數、金額這類「量」改看占全國的百分比', meaning: '▲ 高於全國、▼ 低於全國；占全國比例代表這個縣市在全國的份量。' },
};

export function noteFor(key: string): { definition: string; meaning: string } | undefined {
  return METRIC_NOTES[key] ?? (key.includes('.') ? ELECTION_NOTES[key.split('.').at(-1)!] : undefined);
}
