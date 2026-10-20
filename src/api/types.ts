/**
 * 台灣縣市地圖靜態資料型別（對應 public/data/*.json）。
 */

export interface SourceInfo {
  name: string;
  url: string;
  license: string;
}

export interface Meta {
  /** 本回應產生時間（ISO 8601） */
  generated_at: string;
  /** 資料最後成功同步時間（ISO 8601），可能為 null */
  fetched_at: string | null;
  /** 距離上次成功同步是否超過 36 小時 */
  stale: boolean;
  source: SourceInfo;
  /** 僅在有屆次語意的端點出現 */
  term?: number;
  /** 僅在有會期語意的端點出現，可能為 null */
  session?: string | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

/* ---------- /counties ---------- */

export type CountyElectionKey = 'president_2024' | 'president_2020' | 'mayor_2022' | 'mayor_2018';

export interface CountyCandidate {
  name: string;
  party: string;
  votes: number;
  /** 得票率（%，佔有效票） */
  pct: number;
}

export interface CountyElection {
  /** 選舉人數（中選會原始檔；理論上不會是 null） */
  electorate: number | null;
  /** 投票率（%） */
  turnout: number | null;
  valid: number;
  /** 依得票數由高到低 */
  candidates: CountyCandidate[];
  /** 第一名與第二名的票數差 */
  margin: number | null;
  /** 第一名與第二名的得票率差（百分點） */
  margin_pct: number | null;
}

export type TrendType = 'president' | 'mayor' | 'party_list';

export interface TrendPoint {
  year: number;
  /** 顯示用年份（縣市長 2009 與 2010 五都合為一輪：「2009／10」） */
  label: string;
  valid: number;
  turnout: number | null;
  /** 政黨 → 得票數（無黨籍候選人合併為「無黨籍」） */
  votes: Record<string, number>;
}

export interface CountyItem {
  county: string;
  households: number;
  population: number;
  /** 面積（平方公里）；由 scripts/build-county-stats.mjs 把鄉鎮市區面積加總而來，前端用它算人口密度 */
  area_km2: number;
  /** 20 歲以上（選舉年齡）人口 */
  voting_age: number;
  /** 65 歲以上人口 */
  elderly: number;
  elections: Record<CountyElectionKey, CountyElection>;
  /** 歷次得票（依政黨加總），依年份排序 */
  trends: Record<TrendType, TrendPoint[]>;
  /** 地圖輪廓（SVG path，座標約在 0–530 × 0–735；金門、連江已平移成插圖） */
  path: string;
  legislators: { id: string; name: string; party: string; area_name: string }[];
}

export interface CountiesResponse {
  meta: Meta;
  /** 人口統計年月（YYYY-MM） */
  population_month: string;
  elections: Record<CountyElectionKey, { label: string; date: string }>;
  trend_types: Record<TrendType, string>;
  sources: { label: string; url: string }[];
  count: number;
  items: CountyItem[];
}

/* ---------- /county-stats（scripts/county-stats.mjs） ---------- */

export interface CountyStatField {
  key: string;
  label: string;
  unit: string;
  /** 資料時點，例如「113 年底」 */
  period: string;
  source: string;
  url: string;
  /** 頁首類別按鈕：醫療、房價、農業… */
  category?: string;
  digits?: number;
  /** 比率、中位數這類不能相加的指標：全國值由腳本直接算好 */
  national?: number;
}

export interface CountyStatsResponse {
  meta: { generated_at: string };
  fields: CountyStatField[];
  items: Record<string, Record<string, number | null>>;
}

/** /county-trends：縣市總覽的趨勢線（scripts/county-stats.mjs 一起產生） */
export interface CountyTrendsResponse {
  meta: { generated_at: string };
  /** national：不能由縣市加總的序列（所得、失業率、老年人口比率）另存官方全國值 */
  series: Record<string, { label: string; unit: string; points: { period: string; national?: number; values: Record<string, number | null> }[] }>;
}

/* ---------- /council ---------- */

export type CouncilKind = 'area' | 'plain' | 'mountain';

export interface CouncilCandidate {
  /** 選舉公報上的號次 */
  no: number;
  name: string;
  party: string;
  gender: '男' | '女';
  age: number | null;
  education: string | null;
  elected: boolean;
  /** 因婦女保障名額當選（中選會當選註記 `!`）：得票可能比落選者還少 */
  quota: boolean;
  /** 中選會「現任」欄位；2010 那一屆與桃園市 2014 整欄都是 N，因此只當參考（見 CouncilCompare.incumbent_source） */
  incumbent: boolean | null;
  /** 粉專網址與現任狀態：只有最新一屆、且對照表對得到的當選人才有 */
  facebook?: string;
  facebook_status?: string;
  votes: number;
  /** 得票率（%，佔該選區有效票） */
  pct: number;
}

export interface CouncilDistrict {
  no: string;
  kind: CouncilKind;
  name: string;
  /** 區域選舉區包含的行政區；原住民選舉區為空陣列 */
  area: string[];
  electorate: number;
  population: number;
  valid: number;
  invalid: number;
  ballots: number;
  /** 投票率（%） */
  turnout: number;
  seats: number;
  candidate_count: number;
  /** 依得票數由高到低 */
  list: CouncilCandidate[];
  last_winner: { name: string; party: string; votes: number; pct: number } | null;
  first_loser: { name: string; party: string; votes: number; pct: number; margin: number | null } | null;
}

export interface CouncilKindSummary {
  kind: CouncilKind;
  label: string;
  seats: number;
  electorate: number;
  population: number;
  valid: number;
  invalid: number;
  ballots: number;
  turnout: number;
  candidate_count: number;
}

export interface CouncilParty {
  party: string;
  seats: number;
  votes: number;
  candidates: number;
  pct: number;
  seat_pct: number;
}

export interface CouncilCompare {
  year: number;
  label: string;
  parties: { party: string; seats: number; prev_seats: number; delta: number; votes: number; pct: number }[];
  re_elected: number;
  freshmen: number;
  defeated_incumbents: { name: string; party: string; district: string; votes: number; pct: number }[];
  not_running: { name: string; party: string; district: string }[];
  /** 'cec'＝用中選會的「現任」欄位（整欄都是 N 時視為不可用）；'name_match'＝只能用上屆當選名單比對 */
  incumbent_source: 'cec' | 'name_match';
  /** 中選會現任欄位與「上屆當選名單」不一致的人數（遞補、補選、換選區都會造成） */
  incumbent_mismatch: string[];
  /** 上屆當選者與本屆候選人姓名只差一個字（可能只是不同人，供人工確認） */
  name_variant_suspects: string[];
}

export interface CouncilTerm {
  year: number;
  term: number;
  date: string;
  label: string;
  /**
   * 這一屆的議會名稱。桃園 2009 那一屆是升格前的「桃園縣議會」（桃園縣議員第 17 屆），
   * 其餘是「桃園市議會」——頁面靠它分辨哪一屆不是現在的議會。
   */
  body: string;
  seats: number;
  kinds: CouncilKindSummary[];
  districts: CouncilDistrict[];
  parties: CouncilParty[];
  valid: number;
  stats: {
    candidates: number;
    top: (CouncilCandidate & { district: string }) | null;
    lowest_winner: CouncilCandidate | null;
    highest_loser: CouncilCandidate | null;
    area_electorate: number | null;
    area_turnout: number | null;
  };
  compare: CouncilCompare | null;
}

export interface CouncilResponse {
  meta: Meta;
  source: { label: string; url: string };
  note: string;
  county: string;
  /** 這份資料有建置的縣市（給縣市切換用） */
  counties: string[];
  terms: CouncilTerm[];
  warnings: string[];
}

/* ---------- /legislator-votes ---------- */

export interface LegislatorRace {
  year: number;
  kind: '區域' | '平地原住民' | '山地原住民';
  district: string;
  by_election: boolean;
  party: string;
  votes: number;
  pct: number;
  /** 選區內名次 */
  rank: number;
  elected: boolean;
  seats: number;
  candidates: number;
  /** 當選者對最高票落選者；落選者對最低票當選者 */
  rival: { name: string; party: string; votes: number } | null;
  margin: number | null;
  margin_pct: number | null;
  /** 與本人前一次參選的得票差 */
  change: number | null;
  /** 同選區同黨的總統得票（大選的區域立委才有；無黨籍為 null） */
  president: PartyShare | null;
  /** 同選區同黨的不分區政黨票 */
  party_list: PartyShare | null;
}

export interface PartyShare {
  votes: number;
  pct: number;
  /** 個人票 − 政黨票（票數）；正值表示個人比黨強 */
  over: number;
  /** 個人得票率 − 政黨得票率（百分點） */
  over_pct: number;
}

/** 官方文件裡的投開票數字（`scripts/fetch-recall-results.mjs` 解析，每一列的算式都驗過） */
export interface RecallResults {
  electorate: number;
  voted: number;
  turnout_pct: number;
  agree: number;
  disagree: number;
  /** 無效票＝投票人數 − 同意 − 不同意 */
  invalid: number;
  /** 同意 ÷ 選舉人總數（統一用這個，讓 35 案可比） */
  agree_share_pct: number;
  /** 文件上實際印的佔比；分母各文件不同（2025 公告是選舉人總數、蔡正元實錄是有效票） */
  printed_agree_share?: { pct: number; of: 'electorate' | 'valid' };
  result_text: string;
  /** 官方文件名稱與網址 */
  document: string;
  document_url: string;
  /** 只有陳柏惟那筆：公告的結果表是圖片、沒有文字層，由人工判讀並通過算術驗證 */
  read_from?: string;
}

/**
 * 罷免案（中選會官方清單，`scripts/fetch-cec-recalls.mjs`）。
 * 中選會的罷免表沒有票數；`results` 由 `scripts/fetch-recall-results.mjs` 從官方文件補入。
 */
export interface RecallItem {
  term: number;
  vote_date: string | null;
  name: string;
  area: string;
  district: string | null;
  /** true = 罷免通過（中選會 vote_result = Y）；2015 起 35 案只有陳柏惟（2021）通過 */
  passed: boolean;
  title: string;
  /** 35 案全部都有（見 `scripts/fetch-recall-results.mjs`；每筆都有官方文件出處與算術驗證） */
  results?: RecallResults;
}

export interface LegislatorVotesResponse {
  meta: Meta;
  years: number[];
  sources: { label: string; url: string }[];
  /** 全部罷免案（不篩委員）；委員自己的紀錄在 items[].recalls */
  recalls: RecallItem[];
  recalls_source: { label: string; page: string; endpoint: string; note?: string; fetched_at?: string };
  count: number;
  items: { legislator: { id: string; name: string; party: string; area_name: string | null; region: string | null }; history: LegislatorRace[]; recalls: RecallItem[] }[];
}

/* ---------- /town-map ---------- */

export interface TownMapResponse {
  meta: Meta;
  source: { label: string; url: string };
  count: number;
  /** 與縣市圖同一座標系的 SVG path */
  towns: { county: string; town: string; path: string }[];
}

/* ---------- /population-trend ---------- */

export interface AgeSnapshot {
  /** 年份（該年 12 月），最新一筆為「YYYY-MM」 */
  year: string;
  population: number;
  child: number;
  voting_age: number;
  elderly: number;
}

export interface PopulationTrendResponse {
  meta: Meta;
  /** 「YYYY-MM」，2016-01 起 */
  months: string[];
  years: string[];
  sources: { label: string; url: string }[];
  /** 每月人口；來源缺月（2023-09）為 null */
  counties: { county: string; monthly: (number | null)[]; ages: AgeSnapshot[] }[];
  /** 鄉鎮市區：面積（平方公里）與各年 12 月（及最新月）人口 */
  towns: { county: string; town: string; size: number; population: Record<string, number> }[];
}

/* ---------- /demographics ---------- */

export interface DemographicTown {
  county: string;
  town: string;
  population: number;
  /** 0–14、20–39、65 歲以上占人口比率（%） */
  child_ratio: number;
  young_ratio: number;
  elderly_ratio: number;
  median_age: number;
  household_size: number;
  elections: Record<'president_2024' | 'party_list_2024' | 'president_2020' | 'party_list_2020', PartyBucket | null>;
}

export interface DemographicsResponse {
  meta: Meta;
  population_month: string;
  elections: Record<'president_2024' | 'party_list_2024' | 'president_2020' | 'party_list_2020', string>;
  sources: { label: string; url: string }[];
  count: number;
  towns: DemographicTown[];
}

/* ---------- /split-ticket ---------- */

export interface PartyBucket {
  valid: number;
  votes: Record<string, number>;
}

export interface SplitTicketResponse {
  meta: Meta;
  years: number[];
  year: number;
  count: number;
  items: {
    county: string;
    district: string;
    valid: number;
    candidates: { name: string; party: string; votes: number; pct: number; elected: boolean }[];
    /** 同選區總統票、不分區政黨票（投開票所加總） */
    president: PartyBucket;
    party_list: PartyBucket;
  }[];
}
