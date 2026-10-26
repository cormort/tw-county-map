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
  labor_insured_per1000: { definition: '勞保投保人數 ÷ 同月戶籍人口 × 1,000', meaning: '每 1,000 人對應幾個勞保投保人次；大於人口中工作年齡比例很多時，代表有大量外地人在這裡上班投保。' },
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
  // 社會保險
  national_pension: { definition: '國民年金當月納保人數（依被保險人戶籍所在縣市）', meaning: '投保國民年金的人數；國保是給 25–64 歲、沒有參加勞保、公保、軍保、農保的人。' },
  national_pension_ratio: { definition: '國民年金被保險人數 ÷ 25–64 歲人口 × 100', meaning: '工作年齡人口中，沒有其他職業社會保險（多半是自營、家管、待業或打零工）的比例；越高，代表沒有受僱、沒有雇主分擔保費的人越多。' },
  nhi_insured: { definition: '設籍在這個縣市、有參加全民健保的人數（年底）', meaning: '戶籍人口裡有健保的人數。' },
  nhi_coverage: { definition: '設籍人口參加健保人數 ÷ 同月戶籍人口 × 100', meaning: '設籍的人有幾 % 有健保；沒到 100% 的部分多半是長期出國、停保或失聯人口，數字越低代表戶籍人口跟實際在台人口差越多。' },
  // 財政
  own_revenue_ratio: { definition: '（歲入 － 中央補助及協助收入）÷ 歲入 × 100', meaning: '縣市自己收來的錢（稅、規費等）占總收入多少；越高越不依賴中央補助。' },
  expenditure_per_capita: { definition: '歲出決算 ÷ 同年度年底人口', meaning: '平均花在每位居民身上的預算；地廣人稀或離島通常偏高。' },
  debt: { definition: '縣市政府公共債務餘額（1 年以上＋未滿 1 年，百萬元）', meaning: '縣市政府總共欠多少錢。' },
  debt_per_capita: { definition: '公共債務餘額 ÷ 同年度年底人口', meaning: '平均每位居民背了多少縣市政府的債。' },
  tax_revenue: { definition: '各縣市政府歲入決算之稅課收入（百萬元，含中央統籌分配稅款）', meaning: '地方歲入裡的稅課收入，包含地方稅（地價稅、房屋稅、使用牌照稅等）與中央統籌分配稅款；不是純地方稅，仰賴統籌分配稅的縣市會偏高。' },
  tax_revenue_ratio: { definition: '歲入稅課收入 ÷ 歲入總額 × 100', meaning: '稅課收入占縣市政府整體收入的比重；比重高代表自有稅收能力強，依賴中央補助較少。' },
  tax_revenue_per_capita: { definition: '歲入稅課收入 ÷ 同年度年底人口', meaning: '平均每位縣民對應的歲入稅課收入（含統籌分配稅款），不是個人實際繳的地方稅。' },
  local_tax: { definition: '直轄市及縣(市)稅全年實徵淨額（百萬元，財政部統計月報表 3-5）', meaning: '真正的地方稅收（地價稅、房屋稅、土地增值稅、使用牌照稅等），不含中央統籌分配稅款；比「歲入稅課收入」更接近地方自己的稅收能力。' },
  local_tax_per_capita: { definition: '地方稅實徵淨額 ÷ 同年度年底人口', meaning: '平均每位縣民對應的地方稅收；工商活動強、不動產交易多的縣市通常較高。' },
  tax_filing_tax_payable: { definition: '綜合所得稅結算申報應納稅額加總（百萬元，財政資訊中心專冊）', meaning: '該縣市申報人為國庫貢獻的個人綜合所得稅總額。' },
  tax_filing_avg_tax: { definition: '綜稅應納稅額 ÷ 申報戶數', meaning: '報稅戶平均繳納的所得稅金額。' },
  tax_filing_effective_rate: { definition: '綜稅應納稅額 ÷ 綜合所得總額 × 100', meaning: '綜稅實質有效稅率；高所得申報戶較多的縣市，累進稅率下實質稅率通常較高。' },
  // 所得申報
  tax_filing_avg_income: { definition: '綜合所得申報總額 ÷ 綜稅申報戶數（元／戶，財政資訊中心 113 年度專冊）', meaning: '報稅戶的平均年收入水準（含薪資、股利、利息等課稅所得）。竹科與大都會區通常名列前茅。' },
  tax_filing_total_income: { definition: '該縣市申報之綜合所得總額加總（百萬元）', meaning: '該縣市報稅戶創造的課稅所得規模。' },
  tax_filing_units: { definition: '綜合所得稅結算申報戶數', meaning: '該縣市辦理所得稅申報的家庭／單身戶數。' },
  // 交通與車輛
  cars: { definition: '登記之汽車總數（自用與營業之小客車、大客車、貨車及特種車）', meaning: '該縣市登記的所有汽車數量。' },
  passenger_cars: { definition: '登記之小客車數量（自用與營業小客車）', meaning: '一般自用及營業轎車、休旅車等小客車數量。' },
  motorcycles: { definition: '登記之機車總數（普通輕型、重型及大型重型機車）', meaning: '代步機車總量。' },
  cars_per1000: { definition: '汽車登記數 ÷ 戶籍人口數 × 1,000', meaning: '每千人擁有的汽車數，反映用車普及度。' },
  passenger_cars_per1000: { definition: '小客車登記數 ÷ 戶籍人口數 × 1,000', meaning: '每千人擁有的小客車數。' },
  motorcycles_per1000: { definition: '機車登記數 ÷ 戶籍人口數 × 1,000', meaning: '每千人擁有的機車數；中南部與東部機車普及率普遍較高。' },
  transport_cost_per_household: { definition: '家庭收支調查中平均每戶全年的交通支出（油料、保養、購車、大眾運輸等）', meaning: '每個家庭一年花在交通上的總費用。' },
  ev_charging_points: { definition: '交通部 TDX 平台各縣市及所轄單位之公共充電樁總數（支）', meaning: '該縣市設置之公共電動車充電樁數量。' },
  ev_charging_stations: { definition: '交通部 TDX 平台各縣市公共充電站點數（處）', meaning: '提供公共充電服務的場站數量。' },
  ev_charging_plugs: { definition: '公共充電槍總數（槍）；站點沒填 ConnectCounts 時，以站內 ConnectorCount 加總補足，至少 1 樁 1 槍', meaning: '可同時供車輛插槍充電的插頭總數；通常大於或等於充電樁數。' },
  ev_charging_per10k_cars: { definition: '公共充電樁數 ÷ 汽車登記數 × 10,000', meaning: '每萬輛汽車擁有的公共充電樁數，反映電動車充電設施密度與車樁充裕度。' },
  ev_charging_per100k_pop: { definition: '公共充電樁數 ÷ 戶籍人口數 × 100,000', meaning: '每十萬人擁有的公共充電樁數。' },
  // 能源與太陽能
  solar_capacity: { definition: '台電躉購之太陽光電裝置容量（千瓩／MW）', meaning: '該縣市設置並由台電購入的太陽光電總發電規模；中南部日照充足地區通常規模最大。' },
  solar_power: { definition: '台電自該縣市太陽光電案場累計購入之發電度數（百萬度）', meaning: '太陽光電實際轉化為電網電力的總電量。' },
  solar_count: { definition: '該縣市台電收購之太陽光電設備案件數（件）', meaning: '民間屋頂與地面型太陽能發電案場的累積設置件數。' },
  solar_capacity_per_capita: { definition: '太陽光電躉購裝置容量（瓦） ÷ 同年度年底戶籍人口', meaning: '平均每位居民對應的太陽光電裝置容量，能消除人口多寡影響、真實比較綠能推動力道。' },
  renewable_capacity: { definition: '該縣市太陽光電、風力及其他再生能源躉購總裝置容量（千瓩／MW）', meaning: '該縣市所有綠色再生能源設備的整體發電裝置容量。' },
  renewable_power: { definition: '台電自該縣市各類再生能源累計購入之發電度數（百萬度）', meaning: '該縣市產出的所有綠能電量。' },
  solar_share: { definition: '太陽光電容量 ÷ 再生能源總容量 × 100', meaning: '該縣市再生能源中太陽光電所占比例；部分臨海縣市（如彰化、苗栗）有龐大風力發電。' },
  // 環境保護與永續
  waste_per_capita_daily: { definition: '平均每人每日垃圾產生量（公斤／人-日，環境部統計）', meaning: '每個人每天製造的垃圾重量；數值越低代表垃圾減量成效越好。' },
  recycling_rate: { definition: '資源垃圾＋廚餘回收處理量 ÷ 垃圾產生總量 × 100（環境部統計）', meaning: '廢棄物中被有效回收再利用的比例；越高代表資源永續循環做得越扎實。' },
  waste_total: { definition: '該縣市全年垃圾產生總量（萬公噸）', meaning: '一年累積產生的全部垃圾總量。' },
  sewage_treatment_rate: { definition: '公共污水下水道普及率＋專用污水下水道普及率＋建築物污水處理設施設置率（內政部國土署）', meaning: '生活污水經過污水下水道或適當設施處理的總涵蓋比例。' },
  sewage_public_rate: { definition: '公共污水下水道接管戶數 ÷ 總戶數 × 100', meaning: '家戶直接接通政府公共污水下水道管線的普及程度；是城市基礎建設現代化的重要指標。' },
  air_pm25: { definition: '細懸浮微粒年平均濃度（微克／立方公尺，環境部空氣品質監測站年均值）', meaning: '空氣中 PM2.5 懸浮微粒濃度；數值越低空氣越清新。' },
  air_aqi: { definition: '空氣品質指標全年平均值（環境部監測數據）', meaning: '整體空氣品質綜合評估指標；數值越小代表空氣品質越良好。' },
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

export type MetricPolarity = 'higher_better' | 'lower_better' | 'neutral';

/**
 * 指標好壞極性（首長施政評估視角）：
 * - 'higher_better'：數值越高通常代表施政成果越好或資源越充裕（如所得、就業率、健保覆蓋率、病床數、自有財源）
 * - 'lower_better'：數值越低通常越好（如失業率、粗死亡率、每人負債、高齡化速度、房價所得比、國保比例）
 * - 'neutral'：客觀結構或政治民意數值，無絕對單一方向好壞（如男女比、原住民人口、用電量、政黨得票）
 */
export const METRIC_POLARITY: Record<string, MetricPolarity> = {
  // 人口與動態
  birth_rate: 'higher_better',
  births: 'higher_better',
  pop_growth_rate: 'higher_better',
  pop_growth: 'higher_better',
  net_migration_rate: 'higher_better',
  net_migration: 'higher_better',
  death_rate: 'lower_better',
  deaths: 'lower_better',
  natural_increase: 'higher_better',
  aging_speed: 'lower_better',
  old_dependency: 'lower_better',
  young_dependency: 'neutral',
  primary_outlook: 'higher_better',
  elderly_ratio: 'neutral',
  // 教育
  schools_kindergarten: 'higher_better',
  schools_primary: 'neutral',
  schools_junior: 'neutral',
  schools_senior: 'neutral',
  schools_college: 'neutral',
  pupils_per_primary_school: 'neutral',
  // 醫療與長照
  institutions_per10k: 'higher_better',
  beds_per10k: 'higher_better',
  physicians_per10k: 'higher_better',
  doctors_all_per10k: 'higher_better',
  ltc_per1000_elderly: 'higher_better',
  ltc_points: 'higher_better',
  nhi_coverage: 'higher_better',
  // 經濟與住居
  income: 'higher_better',
  unemployment: 'lower_better',
  house_price: 'neutral',
  price_to_income: 'lower_better',
  house_deals_per10k: 'neutral',
  // 產業與就業
  companies_per1000: 'higher_better',
  businesses_per1000: 'higher_better',
  factories_per10k: 'neutral',
  labor_insured_per1000: 'higher_better',
  national_pension_ratio: 'lower_better',
  // 交通與充電設施
  cars_per1000: 'neutral',
  passenger_cars_per1000: 'neutral',
  motorcycles_per1000: 'neutral',
  ev_charging_points: 'higher_better',
  ev_charging_stations: 'higher_better',
  ev_charging_plugs: 'higher_better',
  ev_charging_per10k_cars: 'higher_better',
  ev_charging_per100k_pop: 'higher_better',
  // 能源與太陽能
  elec_total: 'neutral',
  elec_per_capita: 'neutral',
  elec_residential_per_capita: 'neutral',
  elec_industry_share: 'neutral',
  elec_growth: 'neutral',
  solar_capacity: 'higher_better',
  solar_power: 'higher_better',
  solar_count: 'higher_better',
  solar_capacity_per_capita: 'higher_better',
  renewable_capacity: 'higher_better',
  renewable_power: 'higher_better',
  solar_share: 'neutral',
  // 環境保護與品質
  waste_per_capita_daily: 'lower_better',
  recycling_rate: 'higher_better',
  waste_total: 'neutral',
  sewage_treatment_rate: 'higher_better',
  sewage_public_rate: 'higher_better',
  air_pm25: 'lower_better',
  air_aqi: 'lower_better',
  // 財政
  own_revenue_ratio: 'higher_better',
  expenditure_per_capita: 'neutral',
  debt_per_capita: 'lower_better',
  debt: 'lower_better',
  tax_revenue: 'higher_better',
  tax_revenue_ratio: 'higher_better',
  tax_revenue_per_capita: 'higher_better',
  tax_filing_avg_income: 'higher_better',
  tax_filing_avg_tax: 'higher_better',
  tax_filing_effective_rate: 'neutral',
  // 農業
  farmland: 'neutral',
  farmland_ratio: 'neutral',
};

export function polarityOf(key: string): MetricPolarity {
  return METRIC_POLARITY[key] ?? 'neutral';
}

export function noteFor(key: string): { definition: string; meaning: string } | undefined {
  return METRIC_NOTES[key] ?? (key.includes('.') ? ELECTION_NOTES[key.split('.').at(-1)!] : undefined);
}
