/**
 * 每個比例的「定義」（怎麼算）與「白話意義」（這個數字在說什麼）。
 * 網站（指標選單下方、縣市總覽卡片）與 DATA_SOURCES.md 都從這裡來；新增比例時一起補。
 * 選舉指標的 key 是「選舉.政黨.欄位」，用 noteFor() 依欄位對應。
 */
export const METRIC_NOTES: Record<string, { definition: string; meaning: string }> = {
  // 人口（counties.json）
  voting_age_ratio: { definition: '20 歲以上人口 ÷ 總人口 × 100', meaning: '有投票權的人占多少；越高代表成年人口比例越大。' },
  elderly_ratio: { definition: '65 歲以上人口 ÷ 總人口 × 100', meaning: '老人占多少。超過 14% 稱「高齡社會」，超過 20% 稱「超高齡社會」。' },
  density: { definition: '人口數 ÷ 土地面積（平方公里）', meaning: '每平方公里住幾個人；越高越擁擠、越都市化。' },
  // 人口結構（county-stats.json）
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
  // 醫療與長照
  institutions_per10k: { definition: '醫療院所家數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人分到幾家醫院或診所；越高代表看病的地方越多、越近。' },
  beds_per10k: { definition: '病床數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人有幾張病床，反映住院量能；數字低的地方，重症或住院可能要跨縣市。' },
  physicians_per10k: { definition: '西醫師數 ÷ 年底人口 × 10,000', meaning: '每 1 萬人有幾位西醫師；越少，掛號越難、等越久。' },
  doctors_all_per10k: { definition: '（西醫師＋中醫師＋牙醫師）÷ 年底人口 × 10,000', meaning: '所有醫師加起來的密度，看整體醫療人力。' },
  ltc_per1000_elderly: { definition: '長照 ABC 據點數 ÷ 65 歲以上人口 × 1,000', meaning: '每 1,000 位長者附近有幾個長照服務點；越高，長輩越容易找到日照、居家服務等資源。' },
  // 房價
  house_price: { definition: '住宅成交每坪單價由低到高排序後，正中間那一筆', meaning: '一半的房子比這個貴、一半比這個便宜；用中位數是因為不會被少數豪宅拉高。' },
  house_deals_per10k: { definition: '近四季房屋買賣件數 ÷ 人口 × 10,000', meaning: '房市熱不熱：每 1 萬人一年內有幾筆房屋買賣。' },
  price_to_income: { definition: '住宅成交總價中位數 ÷ 平均每戶可支配所得', meaning: '一般家庭不吃不喝幾年才買得起一間中間價位的房子；越高越難買。官方用所得中位數，這裡用平均數，所以會偏低一些。' },
  // 經濟
  unemployment: { definition: '失業人數 ÷ 勞動力 × 100（勞動力＝15 歲以上有工作或正在找工作的人）', meaning: '想工作的人之中，有幾 % 找不到工作。' },
  // 財政
  own_revenue_ratio: { definition: '（歲入 － 中央補助及協助收入）÷ 歲入 × 100', meaning: '縣市自己收來的錢（稅、規費等）占總收入多少；越高越不依賴中央補助。' },
  expenditure_per_capita: { definition: '歲出決算 ÷ 人口', meaning: '平均花在每位居民身上的預算；地廣人稀或離島通常偏高。' },
  debt_per_capita: { definition: '公共債務餘額 ÷ 人口', meaning: '平均每位居民背了多少縣市政府的債。' },
  // 農業
  farmland_ratio: { definition: '耕地面積 ÷ 縣市土地面積 × 100', meaning: '縣市的土地有多少比例在種田，看農業在土地利用上的份量。' },
};

/** 選舉指標（key 形如 president_2024.民主進步黨.pct）依最後一段欄位對應 */
const ELECTION_NOTES: Record<string, { definition: string; meaning: string }> = {
  pct: { definition: '該政黨候選人得票數 ÷ 有效票數 × 100', meaning: '投給這個政黨的人占有效票多少。' },
  margin_pct: { definition: '第一名得票率 － 第二名得票率（百分點）', meaning: '贏多少：數字越小，代表選得越接近、越有變數。' },
  turnout: { definition: '投票人數 ÷ 選舉人數 × 100', meaning: '有投票權的人裡，有多少人真的去投票。' },
};

export function noteFor(key: string): { definition: string; meaning: string } | undefined {
  return METRIC_NOTES[key] ?? (key.includes('.') ? ELECTION_NOTES[key.split('.').at(-1)!] : undefined);
}
