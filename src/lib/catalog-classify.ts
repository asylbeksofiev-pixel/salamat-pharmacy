// Deterministic classification of catalogue products (public.pharmacy_products) into the nine top-level sections.
// Rules only (no language model): name normalisation → dictionaries → ordered rules with exclusions.
// Every product gets a result: a section with a confidence, or "needs review" (category may be a suggestion or null).
// Nothing here infers pharmacological properties or registration status: rules look at what the name literally says
// (dosage form, product type, brand line), and uncertain cases are left for a person to check.

// 2026-11-21.1: "р-р" after a size word (nappies, pants, pacifiers, supports) is "размер", not "раствор"; sweets sold by
// weight (dragée, pastilles) are food; contact lens care, laundry products, plaque indicator tablets; supplement brand
// lines written with an apostrophe (Nature's Bounty); infusions and prefilled syringes with a solution are medicines.
export const CLASSIFIER_VERSION = "2026-11-21.1";

export const CATEGORY_SLUGS = [
  "lekarstvennye-sredstva",
  "vitaminy-i-bady",
  "travy-i-sbory",
  "medicinskie-pribory-i-izdeliya",
  "pravilnoe-pitanie",
  "mama-i-malysh",
  "lechebnaya-kosmetika",
  "uhod-za-polostyu-rta",
  "gigiena",
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/** Results at or above this confidence are published in category pages; below it they wait for review. */
export const AUTO_THRESHOLD = 0.75;

export interface Classification {
  category: CategorySlug | null;
  confidence: number;
  /** rule id, e.g. "rule:oral-care.toothpaste" */
  method: string;
  reason: string;
  reviewStatus: "auto" | "needs_review";
}

/** NFKC then lower-case ("№" → "no"), ё→е, unify quotes/dashes and Latin look-alike letters inside Cyrillic words, collapse spaces. */
export function normalizeName(name: string): string {
  return ` ${name}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/(?<![\p{L}])д\/(?=\s?\p{L})/gu, "для ")
    .replace(/(?<![\p{L}])д\.(?=\s?\p{L})/gu, "для ")
    .replace(/[«»"“”„'’`]/g, " ")
    .replace(/[‐-―]/g, "-")
    .replace(/[(),;:!?[\]{}/\\|+*]/g, " ")
    .replace(/\s+/g, " ")
    .concat(" ");
}

// ---------- dictionaries ----------

const re = (src: string) => new RegExp(src, "u");
// Word start/end that also works for Cyrillic (\b does not).
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}])";
const stem = (stems: string) => re(`${B}(?:${stems})`);

/**
 * "р-р" is the usual abbreviation of both "раствор" (solution) and "размер" (size). It is a size when a size label
 * follows: S/M/L/XL…, NB, or a one- or two-digit size ("р-р 2", "р-р 4-5", "р-р 7,5", "р-р 1 (0-6 мес)") that is
 * not a dose or a volume ("р-р 5 мл", "р-р 0,9%"). Runs on normalised names: commas and brackets are spaces, and
 * NFKC turns "№" into "no".
 */
const UNIT = "(?:мкг|мг|мл|ме|ед|гр|г|ml|mg|mcg|iu)(?![\\p{L}])";
const SIZE_AFTER_RR =
  "\\s*(?:(?:[xх]{0,4}(?:s|m|l|м|л)|nb|xs)(?![\\p{L}])" +
  `|\\d{1,2}(?:-\\d{1,2})?(?![\\d.])(?=\\s*(?:$|(?:№|no)\\s?\\d|\\d{4,}|\\d(?:\\s|$)|\\d{1,2}-\\d|(?!${UNIT})\\p{L}{3,})))`;

const D = {
  // dosage forms and medicine wording
  tablets: stem("таблет|таб(?=\\s|$|\\.)|tabs?(?=\\s|$)|табл\\.?|драже|пастилк|леденц(?:ы|ов)? д(?:ля)? рассас"),
  capsules: stem("caps(?=\\s|$)|капсул|капс\\.?(?=\\s|$)"),
  injection: stem("инъекц|иньекц|ампул(?:а|ы|ах)?(?=\\s|$)|в ампулах|лиофилизат|для приготовления раствора для|шприц-тюбик|шприц-ручк|флакон.*в/в|в/м|(?:эмульсия|концентрат|раствор) для инфузий|для внутривенного введения"),
  solution: stem(`раствор|р-р(?!${SIZE_AFTER_RR})|концентрат для приготовления`),
  suppository: stem("суппоз|супппоз|свеч(?:и|а) (?:ректальн|вагинальн)|свечи(?=\\s|$)"),
  ointment: stem("мазь|линимент|паста (?:цинковая|салициловая|теймурова|лассара)"),
  drops: stem("капли"),
  eyeEarNose: stem("глазн|ушн|назальн|для носа|в нос"),
  syrup: stem("настойк|экстракт жидк|сироп|суспенз|эликсир|эмульсия для приема"),
  powderOral: re(`${B}(?:порошок|гранулы|саше)${E}.*(?:для приготовления|для приема|раствора|суспензии|внутрь)|${B}гранулы${E}|${B}порошок${E}(?!.*(?:зубн|детск|присып|стиральн|для стирки))`),
  aerosol: stem("аэрозоль|спрей (?:назальн|для носа|для горла|для полости рта|для наружн|дозирован)|назальный спрей|спрей-бальзам"),
  seaWater: stem("синомарин|sinomarin|морская вода|морской воды|аква марис|aqua maris|аквалор|aqualor|физиомер|долфин|хьюмер|маример|отривин море|аквамастер|салин"),
  gelMed: re(`${B}(?:гель|крем-гель|эмульгель)${E}.*(?:для наружного|для местного|вагинальн|стоматологическ|офтальмолог|глазной)`),
  inhaler: stem("ингаляц|аэрозоль для ингаляций|порошок для ингаляций|небул|турбухалер|дискус"),
  effervescent: stem("шипуч"),
  dose: re(`${B}\\d+(?:[.,]\\d+)?\\s?(?:мг|mg|мкг|mcg|ме|me|ед|iu|г/мл|мг/мл|мг/г|%)${E}`),
  percent: re(`\\d+(?:[.,]\\d+)?\\s?%`),
  medNote: stem("для наружного применения|для местного применения|вагинальн|ректальн|трансдермальн|подъязычн|сублингв|защечн|кишечнораствор|пролонгирован|с модифицированным высвобождением|покрытые оболочкой|п/о|диспергируем|жевательные таблетки|лекарственн"),

  // supplements and vitamins
  bad: stem("бад(?=\\s|$)|биологически активн|биодобавк|пищевая добавка|dietary supplement"),
  badBrands: stem(
    "эвалар|evalar|солгар|solgar|now foods|now (?=\\p{L})|доппельгерц|doppelherz|orzax|орзакс|vitime|витайм|natures bounty|nature's bounty|nature s bounty|нэйчес баунти|animal parade|энимал парад|dr\\.? frei|доктор фрай|алфавит|alfavit|turamin|турамин|vitamir|витамир|fitness formula|california gold|киркланд|kirkland|nutricost|бадм|арт лайф|art life|сибирское здоровье|siberian wellness|naturalsupp|натуралсапп|vplab|qnt|maxler|optimum nutrition|ultimate nutrition|sport technology|olimp|nutrend|geon|биотредин|супрадин кидс|мульти-табс|multi-tabs|пиковит|vitrum|витрум|центрум|centrum|компливит|complivit|солгар|ферретаб|элевит|elevit|прегнакеа|pregnacare|вита-|vita-?mishki|витамишки|bioniq|zinc|now",
  ),
  vitaminWords: stem(
    "млрд кое|кое(?=\\s)|витамин|vitamin|мультивит|поливит|омега|omega|рыбий жир|fish oil|магний|magnesium|кальций|calcium|цинк|zinc|железо|iron|селен|selenium|йод|iodine|коллаген|collagen|глюкозамин|хондроитин|q10|коэнзим|лецитин|биотин|biotin|фолиев|folic|лютеин|lutein|пробиотик|probiotic|пребиотик|бифидо|лакто(?:бакт|бацилл)|спирулин|хлорелл|гиалурон.*капс|аскорбин|ретинол|токоферол|холекальциферол|d3",
  ),

  // herbs
  herbs: stem(
    "мать-и-мачех|зерде (?!.*(?:таблет|капсул|сироп))|фиточай|фито[- ]?чай|травяной сбор|сбор(?=\\s|$)|сбор (?:№|желудоч|грудн|почечн|успокоит|мочегон|желчегон|противогеморр)|цветки|цветков|листья|листьев|лист(?=\\s|$)|корни|корневища|корень|трава(?=\\s|$)|травы(?=\\s)|плоды|семена|кора(?=\\s|$)|почки березы|почки сосны|шишки|ромашк|календул|зверобо|шалфе|чабрец|тысячелистн|крапив|подорожник|пустырник|валериан.*(?:корн|трав)|мята|мелисс|шиповник|боярышник.*плод|толокнянк|бессмертник|душиц|липа|липы|иван-ча|копорск|эхинацеи трава|сенны лист|солодки корн|алтайские травы|травяной чай|herbal tea|фильтр-пакет",
  ),

  // medical devices and supplies
  devices: stem(
    "тутор|рукав (?:мед|компр)|электрогрелк|пилюля(?=\\s)|органайзер для таблет|пояс из|овуляц|устройство для|облучатель|рециркулятор|скальпел|очки защитн|клеенка (?:подкладн|медицин)|кинезио|тейп|система для вливан|система инфузион|аспиратор(?! назальн)|тонометр|термометр|градусник|глюкометр|тест-полоск|тест полоск|ланцет|небулайзер|ингалятор(?! для)|пульсоксиметр|оксиметр|стетоскоп|фонендоскоп|массажер|ирригатор|грелк|кружка эсмарха|клизма|спринцовк|шприц(?!-тюбик|-ручк)|игла|катетер|канюл|систем[аы] для|бинт|марля|марлев|вата (?:медицинск|хирургическ)|медицинская вата|пластыр|лейкопластыр|повязк|салфетк[аи] (?:стерильн|марлев|кровоостанавл|антисептическ|спиртов)|спиртовые салфетки|перчатк|маска медицинск|маски медицинск|бахил|пеленк[аи] (?:впитывающ|медицинск)|судно|утк[аи] медицин|мочеприемник|калоприемник|стомическ|бандаж|корсет|ортез|корректор\\p{L}* осанки|пояс поддерживающ|для (?:контактных )?линз|напалечник|наколенник|налокотник|голеностоп|фиксатор|шина |бюстгальтер компресс|трикотаж компресс|компрессионн|чулки|колготки (?:компресс|антиварик)|гольфы (?:компресс|антиварик)|эластичный бинт|бинт эластичн|стельк|ортопедическ|подушка ортопед|костыл|трость|ходунк|коляска инвалид|тест на беременность|тест для определения|тест-систем|экспресс-тест|тест (?=\\p{L})|тест(?=\\s|$)|презерватив|condom|медтекстиль|эласт(?=\\s|$)|elast|pharmaplast|фармапласт|unifix|омрон|omron|microlife|микролайф|b\\.well|бивел|little doctor|литтл доктор|and (?=ua|ue)|a&d|beurer|бойрер|gamma|термоконтейнер|таблетниц|контейнер для (?:таблеток|анализ)|пипетк|мерный стаканчик|пинцет|ножницы медицинск|лупа|бахилы|жгут|воротник шанца|ингаляционн.*маск|маска для небулайзер|трубка воздушн|стаканчик для ингалятор|насадк[аи] для (?:ирригатор|ингалятор)|ушные палочки медицин|аппликатор кузнецова|ипликатор|пояс (?:из собачьей|согревающ|ортопед|радикулит)|ватные шарики|вата(?=\\s|$)",
  ),

  // food
  food: stem(
    "вода (?:негаз|газ|питьев|арзу)|негазированн|шейкер|shaker|gainer|гейнер|whey|сывороточный протеин|вода (?:нарзан|ессентуки|боржоми|шымбулак|shymbulak|сарыагаш|tassay|тассай)|нарзан|ессентуки|питание (?:для|сухое|жидк|специализ)|педиашур|pediasure|нутриэн|nutrien|нутризон|nutrison|нутридринк|nutridrink|модулен|modulen|лимонад|боржоми|borjomi|газированн|ж/б|молоко (?:кобыл|верблюж|сух)|саумал|шубат|каша|пюре|смесь|сок(?=\\s|$)|нектар|печенье|батончик|напиток|мюсли|хлебц|кисель|мед(?=\\s|$)|мёд|минеральная вода|вода минеральн|питьевая вода|вода (?:лечебн|столов)|соль (?:пищев|морская пищ|поварен)|сахарозаменит|подсластит|стевия|фруктоза|сироп топинамбур|топинамбур|клетчатк|отруби|протеин|protein|гейнер|аминокислот|bcaa|изотоник|спортивн(?:ое|ый) питан|шоколад|конфет|мармелад|джем|чай(?=\\s|$)|кофе|какао|детское питание|молочк[оа] (?:детск|сух)|кефир|йогурт|творож|снек|чипсы|орех|сухофрукт|гематоген|пастила|зефир|леденцы|жевательная резинка|жвачк|продукт (?:для|диетич)|диетическ|безглютен|без глютена|без сахара|питание для",
  ),
  babyFood: stem("фрутоняня|агуша|нутрилак|нутрилон|nutrilon|нан(?=[\\s-]\\d|\\s)|nan(?=\\s)|хумана|humana|хипп|hipp|семпер|semper|малютка|бабушкино лукошко|флер альпин|fleur alpine|heinz|хайнц|гербер|gerber|беллакт|bellact|кабрита|kabrita|нэнни|nanny|similac|симилак|фрисо|friso|винни|тема(?=\\s)|спелёнок|спеленок|сады придонья|маленькое счастье|когда я вырасту|мамако|mamako|бамболина|ам-?ам|смесь (?:молочн|сух|детск|на козьем)|детское питание|детская каша|для детского питания|пюре (?:первая|детск)|с \\d+ ?мес|детск(?:ое|ий|ая) (?:печенье|чай|сок|пюре|каша|кисель|вода)|вода детская|детская вода"),
  foodBrands: stem("бона форте|bona forte|леовит|leovit|фрутоняня|агуша|нутрилак|нутрилон|nutrilon|нан(?=\\s)|nan(?=\\s)|хумана|humana|хипп|hipp|семпер|semper|малютка|бабушкино лукошко|флер альпин|fleur alpine|heinz|хайнц|гербер|gerber|нестле|nestle|беллакт|bellact|кабрита|kabrita|нэнни|nanny|similac|симилак|фрисо|friso|винни|тема(?=\\s)|спелёнок|спеленок|сады придонья|маленькое счастье|когда я вырасту|мамако|mamako|алтайские сказки"),

  // baby
  baby: stem(
    "аспиратор назальн|назальный аспиратор|трусик(?:и)? (?=.*(?:\\d|[smlx]{1,3}(?=\\s)|для дев|для мальч))|ночные трусики|dry nites|пустышк|соск[аи]|бутылочк|поильник|прорезывател|погремушк|грызунок|ниблер|подгузник|трусики-подгузник|трусики (?=\\p{L}*\\s*(?:подгуз|детск|для малыш))|детские трусики|пеленк|присыпк|молокоотсос|накладк[аи] на (?:грудь|сосок|соски)|прокладки (?:для|в) (?:груди|бюстгальтер)|вкладыши для бюстгальтер|лактац|для кормящих|для беременных|беременност(?!ь\\s*тест)|термометр для (?:ванн|воды)|ванночк|горшок|слюнявчик|нагрудник|ложк[аи] (?:детск|силикон|для кормл)|тарелк[аи] детск|контейнер для (?:грудного|молока|детского)|стерилизатор|подогреватель|детск(?:ий|ая|ое|ие) (?:крем|шампун|мыл|пен|масл|присып|салфет|зубн|гель для купан|косметик)|для купания|для малыш|для новорожденн|новорожденн|младен|малыш|грудного вскармлив|с рождения|0\\+|\\d+\\s?мес|\\d+-\\d+\\s?мес",
  ),
  babyBrands: stem("вкладыши (?:одноразовые )?для бюстг|папа кер|papa care|мама стори|mama store|ложка (?:силикон|детск)|силиконовая ложка|yokosun|йокосан|tomiko|томико|мама знает|марти(?=\\s)|marti(?=\\s)|momi|моми(?=\\s)|helen harper|хелен харпер|canpol|кэнпол|avent|авент|nuk(?=\\s|$)|нук(?=\\s)|tommee tippee|томми типпи|chicco|чикко|pigeon|пиджен|nip(?=\\s|$)|нип(?=\\s)|lovi|лови(?=\\s)|бусинка|курносики|kurnosiki|mepsi|мепси|pampers|памперс|хаггис|huggies|merries|мерриес|moony|муни|goon|гун(?=\\s)|libero|либеро|joonies|джунис|мимими|бэби|baby|babyline|бебиблюз|мир детства|happy baby|хэппи беби|bebe|бебе|mustela|мустела|bubchen|бюбхен|johnson's baby|джонсонс беби|наша мама|умка|ушастый нянь|tuttelle|туттелле|philips avent|medela|медела"),

  // cosmetics
  cosmeticWords: stem(
    "ногт|соль для ванн|соль морская для ванн|средство для ванн|пена для ванн|бомбочк|антипресперант|антиперсперант|волос|ресниц|бровей|аромамасл|эфирное масло|масло (?:\\p{L}+ )?(?:лимон|апельсин|лаванд|чайного дерева|эвкалипт|розмарин|мяты|макадами|жожоба|ши|арган|косточ|миндал|персик|кокос|облепих|репейн|касторов|шиповн)|массажн|глина|грязь (?:лечебн|мертвого)|для ухода за кожей|крем(?!-?(?:мазь|гель д(?:ля)? наружн))|сыворотк|serum|лосьон|тоник|флюид|эмульсия(?! для приема)|молочко|мицеллярн|пенк[аи]|мусс|скраб|пилинг|маска(?! медицинск)|патчи|бальзам для губ|бальзам-ополаскиватель|бальзам для волос|бальзам д/|помада гигиен|гигиеническая помада|дезодорант|антиперспирант|шампунь|кондиционер для волос|кондиционер(?=\\s)|ополаскиватель для волос|масло для (?:тела|лица|волос|загара|душа|ванн)|масло сухое|солнцезащит|spf|загар|автозагар|после загара|термальная вода|спрей для (?:лица|тела|волос)|мист|тональн|консилер|пудра|тушь|праймер|гель для (?:умывания|душа|лица|кожи вокруг)|для умывания|для снятия макияжа|демакияж|антивозраст|против морщин|увлажняющ|питательн|восстанавливающ|успокаивающ|матирующ|отбеливающ|осветляющ|anti-age|для кожи|для лица|для тела|для рук|для ног|для волос|для губ|вокруг глаз|контура глаз|для век",
  ),
  cosmeticBrands: stem(
    "uriage|урьяж|la roche|ла рош|рош-позе|рош позе|bioderma|биодерма|vichy|виши|avene|авен(?=\\s|$)|эйвен|nuxe|нюкс|a-derma|а-дерма|ducray|дюкрей|klorane|клоран|cerave|цераве|isis ?pharma|исис|mustela|weleda|веледа|nivea|нивея|librederm|либридерм|eucerin|эуцерин|lierac|лиерак|filorga|филорга|topicrem|топикрем|noreva|норева|svr(?=\\s)|caudalie|кодали|phyto(?=\\s)|фито(?=\\s)p|rene furterer|рене фуртерер|sesderma|сесдерма|martiderm|мартидерм|bioplex|kerastase|garnier|гарньер|loreal|лореаль|dove|дав(?=\\s)|chistaya liniya|чистая линия|черный жемчуг|бархатные ручки|невская косметика|librederm|eveline|эвелин|floresan|флоресан|натура сиберика|natura siberica|mixit|миксит|holy land|холи ленд|cosrx|медипил|medi-peel|tony moly|bergamo|jigott|ekel|farmstay|tenzero|el'skin|deoproce|beauty style|бьюти стайл|mediheal|сенсибио|sensibio|atoderm|атодерм|sebium|себиум|effaclar|эфаклар|cicaplast|цикапласт|toleriane|толеран|anthelios|антгелиос|lipikar|липикар|mineral 89|минерал 89|liftactiv|лифтактив|dercos|деркос|normaderm|нормадерм|capital soleil|bariederm|барьедерм|xemose|ксемоз|hyseac|исеак|roseliane|розельян|cleanance|клинанс|cicalfate|сикальфат|tolerance|xeracalm|ксеракалм|hydrance|гидранс|exomega|экзомега|dermalibour|дермалибур|anaphase|анафаз|keracnyl|керакнил|reve de miel|huile prodigieuse|veoles|веолес|tuttelle|секреты лан|нельсон|aravia|аравия|kora|кора(?=\\s+крем)|librederm|бьюти|beauty|ромашка обыкновенная|green mama|грин мама|planeta organica|планета органика|organic|органик|biolan|биолан|uriage",
  ),

  // oral care
  oral: stem(
    "ротовой полости|полоскания рта|освежитель для рта|(?<![\\p{L}])з п(?=\\s)|для верхней челюсти|для нижней челюсти|протефикс|protefix|щетка для языка|скребок для языка|зубн(?:ая|ой|ые) (?:паст|щетк|порош|нит|гель)|зубная|зубной|паста зубная|щетка зубная|зубные щетки|межзубн|ершик|флосс|floss|зубная нить|нить зубная|ополаскиватель для (?:рта|полости рта|десен|зуб)|ополаскиватель(?! для волос)|для полости рта|полости рта|для десен|десна|десен|ирригатор|для зубов|для зубных протезов|для протезов|фиксирующий крем для|корега|corega|лесной бальзам|blend-a-med|блендамед|colgate|колгейт|oral-?b|орал-?би|орал б|splat|сплат|lacalut|лакалут|curaprox|курапрокс|curasept|курасепт|president|президент|sensodyne|сенсодин|parodontax|пародонтакс|elmex|элмекс|r\\.o\\.c\\.s|рокс|roks|tepe|тепе|jordan|джордан|biorepair|биорепейр|mexidol dent|мексидол дент|асепта|asepta|пародонтол|новый жемчуг|silca|силка|dentissimo|дентиссимо|vivax dent|рокс|миррадент|miradent|edel ?\\+ ?white|эдель(?!вейс)|pierrot|пиерот|marvis|марвис|aquafresh|аквафреш|apadent|ападент|ультрадекс|ultradex|ортодонт|кариес|отбеливающая (?:паста|полоск)|полоски отбел|ополаскивател|зубного налета|plack test|plack tabs",
  ),

  // hygiene
  hygiene: stem(
    "антисептик|расческ|расчестк|для причес|ежедневн|discreet|дискрит|салфетк|полотенц|кассет[аы] для брит|кассеты|ушные палочки|интим|прокладк|тампон|ватные (?:диски|палочки)|ватные палочки|ватн(?:ые|ых) диск|влажные салфетки|салфетки влажн|салфетки бумажн|бумажные платочки|платочки|туалетная бумага|мыло|гель для интимн|для интимной гигиены|интимн|дезодорант для ног|антисептик для рук|антибактериальн(?:ый|ое) (?:гель|спрей|мыл)|санитайзер|средство для мытья|пеленки впитывающие|подгузники для взрослых|для взрослых|трусы впитывающ|впитывающие трусы|урологическ|seni|сени(?=\\s)|tena|тена(?=\\s)|abena|абена|id expert|always|олвейс|kotex|котекс|bella|белла|naturella|натурелла|libresse|либресс|carefree|кэфри|кэффри|o\\.?b\\.?(?=\\s)|ола(?=\\s)|ola!|молфикс|molfix|bounty (?:полотенц|бумаж|салфет)|мыльный|бритв|станок|пена для бритья|гель для бритья|расческ|зеркало|пилочк|ножницы маникюр|кусачк|депилятор|воск для депиляц|смазк|лубрикант|гель-смазк|интим-гель",
  ),
} satisfies Record<string, RegExp>;

const has = (n: string, k: keyof typeof D) => D[k].test(n);

// Product types that are never medicines, whatever abbreviations their names use ("р-р" = size).
const NAPPIES = re(`${B}(?:подгузн|трусики|трусы (?:одноразов|послеродов|впитыва|для плавания|c прокладкой|с прокладкой)|нижнее белье|впитывающее белье)`);
const PACIFIERS = re(`${B}(?:соск[аи]${E}|соска-пустышк|пустышк)`);
const POSTPARTUM = re(`послеродов|${B}для мам${E}|для рожениц`);
const ADULT_ABSORBENT = re(
  `для взрослых|для женщин|для мужчин|женск|мужск|менструальн|урологическ|депенд|depend|${B}seni${E}|${B}сени${E}|${B}tena${E}|${B}тена${E}|abena|абена|${B}id${E}|life premium|terezamed|frau comfort|marabu|марабу|котекс|kotex|always|олвейс|libresse|либресс`,
);
// Household products (laundry, dishes): the catalogue has no household section, hygiene is the closest one.
const HOUSEHOLD = re(`${B}(?:для стирки|стиральн|пятновывод|отбеливатель|кондиционер для белья|для посудомоечн|для мытья (?:дет\\p{L}* )?посуды|средство для посуды)`);
const FOR_CHILDREN = re(`детск|${B}дет\\.|для детей|для новорожд|ушастый нянь|мама знает`);
// Creams, powders and wipes "for nappies" are skin care, not nappies.
const NAPPY_CARE = re(`${B}(?:крем|мазь|присыпк|салфетк|масл|лосьон|пенк|гел|бальзам|спрей)`);
// Sweets sold by weight ("Драже без сахара 20 гр", "пастилки из фруктов 40 гр"): confectionery, not a dosage form.
const SWEETS = re(`${B}(?:драже|пастилк|пастил[аы]|леденц|мармелад|конфет)`);
const BY_WEIGHT = re(`\\d\\s?(?:гр?|g)${E}`);

function result(category: CategorySlug | null, confidence: number, rule: string, reason: string): Classification {
  return {
    category,
    confidence: Math.round(confidence * 100) / 100,
    method: `rule:${rule}`,
    reason,
    reviewStatus: category && confidence >= AUTO_THRESHOLD ? "auto" : "needs_review",
  };
}

/**
 * Classifies one product name. Ordered rules: the first rule that matches decides.
 * Order matters and encodes the boundaries from the brief (e.g. a children's medicine stays a medicine,
 * a medicinal ointment is not cosmetics, a vitamin product is not declared a dietary supplement without a sign).
 */
export function classifyName(rawName: string): Classification {
  const n = normalizeName(rawName ?? "");
  if (!n.trim()) return result(null, 0, "empty", "Пустое название");

  const medForm = has(n, "tablets") || has(n, "capsules") || has(n, "injection") || has(n, "suppository") || has(n, "ointment") || has(n, "syrup") || has(n, "powderOral") || has(n, "inhaler");
  const liquidMed = has(n, "solution") || (has(n, "drops") && has(n, "eyeEarNose")) || has(n, "gelMed") || (has(n, "aerosol") && !has(n, "cosmeticBrands") && !has(n, "cosmeticWords"));
  const dosed = has(n, "dose");
  const badSign = has(n, "bad") || has(n, "badBrands");
  const vitamin = has(n, "vitaminWords");

  // 0. Nappies, pants and pacifiers, before anything else: these names often carry "р-р" (size) and "№" (count).
  if (has(n, "baby") || has(n, "babyBrands") || NAPPIES.test(n) || PACIFIERS.test(n)) {
    if (NAPPIES.test(n) && !NAPPY_CARE.test(n)) {
      if (POSTPARTUM.test(n)) return result("mama-i-malysh", 0.8, "baby.mother", "Послеродовое бельё — товар для мамы");
      if (ADULT_ABSORBENT.test(n)) return result("gigiena", 0.85, "hygiene.adult", "Средство личной гигиены для взрослых");
      return result("mama-i-malysh", 0.88, "baby", "Товар для младенцев, кормления или ухода за малышом");
    }
    if (PACIFIERS.test(n)) return result("mama-i-malysh", 0.88, "baby", "Товар для младенцев, кормления или ухода за малышом");
  }

  // 0a. Household products: laundry and dish detergents (for children's things — "Mother and baby").
  if (HOUSEHOLD.test(n)) {
    if (FOR_CHILDREN.test(n)) return result("mama-i-malysh", 0.85, "baby.household", "Бытовое средство для детских вещей или посуды");
    return result("gigiena", 0.8, "household", "Бытовое средство (стирка, посуда) — ближайший раздел «Гигиена»");
  }

  // 1. Oral care: toothpastes, brushes, floss, rinses — before medicines (some contain "%" or "мг"),
  //    but a gum *medicine* (gel with a dose/"%" that is not a toothpaste) is left to the medicine rules.
  if (has(n, "oral") && !/пустышк|соск[аи]/.test(n) && !(medForm && !/зубн|щетк|ершик|флосс|нит/.test(n))) {
    return result("uhod-za-polostyu-rta", 0.92, "oral-care", "Средство или принадлежность для ухода за полостью рта");
  }

  // 2. Explicit dietary supplement wording.
  if (has(n, "bad")) return result("vitaminy-i-bady", 0.95, "supplements.explicit", "В названии указано «БАД» / биологически активная добавка");

  // 3. Medical devices and supplies (device words are specific; checked before dosage forms because
  //    e.g. "шприц" or "тест" names do not describe medicines).
  // A prefilled syringe with a solution for injection is a medicine ("Катенокс готовый шприц раствор для инъекций").
  // ("готовый шприц" alone is left as it was: such products can be medical devices, e.g. hyaluronate syringes).
  const prefilled = /раствор для (?:инъек|иньек)/u.test(n) && !/систем|канюл|катетер|(?<![\p{L}])игл/u.test(n);
  if (has(n, "devices") && !(medForm && dosed) && !prefilled) {
    if (has(n, "baby") && /термометр для (?:ванн|воды)|пустышк|соск/.test(n)) {
      return result("mama-i-malysh", 0.85, "baby.accessory", "Принадлежность для ухода за младенцем");
    }
    return result("medicinskie-pribory-i-izdeliya", 0.88, "devices", "Медицинский прибор, изделие или перевязочный материал");
  }

  // 3a. Insect repellents are not medicines.
  if (/от комаров|от клещей|репеллент|комарофф|москитол|раптор|фумитокс/.test(n)) {
    return result("gigiena", 0.7, "hygiene.repellent", "Средство от насекомых — к гигиене, нужна проверка");
  }

  // 3b. Nasal sprays with sea water may be registered as medicines or as medical devices — not decided by name.
  if (has(n, "seaWater")) return result("medicinskie-pribory-i-izdeliya", 0.5, "devices.sea-water", "Средство с морской водой: статус (ЛС или медизделие) по названию не определяется");

  // 3c. Sweets sold by weight are food even when the name says "драже" or "пастилки" (no count, no dose).
  if (medForm && SWEETS.test(n) && BY_WEIGHT.test(n) && !/№|(?<![\p{L}])no\s?\d/u.test(n) && !dosed && !has(n, "medNote") && !badSign && !vitamin) {
    if (has(n, "babyFood") || FOR_CHILDREN.test(n)) return result("mama-i-malysh", 0.86, "baby.food", "Детское питание (назначение — для детей)");
    return result("pravilnoe-pitanie", 0.8, "food.sweets", "Сладости на развес (драже, пастилки) — пищевой продукт, не лекарственная форма");
  }

  // 4. Medicines: an explicit dosage form, usually with a dose. A dosage form plus a supplement brand/vitamin
  //    words is a vitamin/supplement product; its status (medicine or supplement) is not decided from the name.
  if (medForm || liquidMed) {
    if (badSign) return result("vitaminy-i-bady", 0.85, "supplements.brand-form", "Лекарственная форма + линейка витаминов/БАД производителя");
    if (vitamin && !dosed) return result("vitaminy-i-bady", 0.7, "vitamins.form-no-dose", "Витамины/минералы в лекарственной форме; статус (ЛС или БАД) по названию не определяется");
    if (vitamin && dosed) return result("vitaminy-i-bady", 0.65, "vitamins.form-dose", "Витамин/минерал с дозировкой: может быть лекарственным препаратом — нужна проверка");
    const strong = dosed || has(n, "medNote") || has(n, "injection") || has(n, "suppository") || has(n, "inhaler");
    if (!strong && !has(n, "tablets") && (has(n, "capsules") || /пастилк|драже|леденц/.test(n))) {
      return result("lekarstvennye-sredstva", 0.6, "medicine.capsules-no-dose", "Капсулы/пастилки без дозировки: это может быть и лекарство, и БАД — по названию не определяется");
    }
    const conf = strong ? 0.9 : 0.78;
    return result("lekarstvennye-sredstva", conf, "medicine.dosage-form", "Лекарственная форма в названии (таблетки, капсулы, раствор, мазь и т. п.)");
  }

  // 5. Vitamins/supplements without a dosage form word (e.g. "Омега-3 жевательные мармеладки").
  if (badSign && !has(n, "cosmeticWords")) return result("vitaminy-i-bady", 0.85, "supplements.brand", "Линейка витаминов/БАД производителя");

  // 6. Herbs and herbal teas (children's teas go to "Mother and baby").
  if (has(n, "herbs") && !has(n, "cosmeticWords") && !has(n, "babyBrands") && !/детск/.test(n)) {
    return result("travy-i-sbory", /фиточай|сбор|трава|цветк|лист|корн|плоды|семена|кора|чай/.test(n) ? 0.85 : 0.72, "herbs", "Лекарственное растительное сырьё, сбор или травяной чай");
  }

  // 6b. Baby food by purpose (infant formula, baby purées, cereals and teas), before general nutrition.
  if (has(n, "babyFood") && !medForm) return result("mama-i-malysh", 0.86, "baby.food", "Детское питание (назначение — для детей)");

  // 7. Mother and baby: baby care items, nappies, feeding accessories; baby food goes here by purpose.
  if (has(n, "babyBrands") || has(n, "baby")) {
    if (has(n, "hygiene") && /для взрослых|seni|tena|abena|урологическ|always|kotex|bella(?! baby)|naturella|libresse/.test(n)) {
      return result("gigiena", 0.85, "hygiene.adult", "Средство личной гигиены для взрослых");
    }
    if (has(n, "food") || has(n, "foodBrands")) return result("mama-i-malysh", 0.85, "baby.food", "Детское питание (назначение — для детей)");
    if (has(n, "cosmeticWords")) return result("mama-i-malysh", 0.8, "baby.care", "Средство ухода для малыша или кормящей мамы");
    return result("mama-i-malysh", 0.88, "baby", "Товар для младенцев, кормления или ухода за малышом");
  }

  // 8. Hygiene: pads, tampons, cotton products, wipes, soap, intimate care, adult incontinence.
  if (has(n, "hygiene") && !has(n, "cosmeticBrands") && !(dosed && /(?<![\p{L}])(?:спрей|гель|крем|мазь|суппоз|свечи)/u.test(n))) {
    return result("gigiena", 0.86, "hygiene", "Средство личной гигиены");
  }

  // 9. Therapeutic cosmetics: dermocosmetic brands and skin/hair care products.
  //    A "cream" with a concentration or medicine wording is not treated as cosmetics.
  if (has(n, "cosmeticBrands") || has(n, "cosmeticWords")) {
    if ((has(n, "percent") || has(n, "medNote")) && !has(n, "cosmeticBrands")) {
      const cosmeticDescriptor = /для (?:ног|лица|рук|тела|сухой кожи|волос)|пенк|бустер|шампун|увлажн|питательн|сыворотк|мочевин/.test(n);
      if (!cosmeticDescriptor && /(?:крем|мазь|гель|эмульсия|лак для ногтей)/.test(n)) {
        return result("lekarstvennye-sredstva", 0.82, "medicine.topical", "Крем/мазь/гель с концентрацией действующего вещества");
      }
      return result("lekarstvennye-sredstva", 0.6, "medicine.topical-unclear", "Средство с концентрацией, но с признаками косметики — нужна проверка");
    }
    if (has(n, "hygiene")) return result("gigiena", 0.75, "hygiene.cosmetic-brand", "Средство гигиены косметического бренда");
    return result("lechebnaya-kosmetika", has(n, "cosmeticBrands") ? 0.9 : 0.78, "cosmetics", "Средство ухода за кожей, волосами или лицом");
  }

  // 10. Food and specialised nutrition.
  if (has(n, "food") || has(n, "foodBrands")) return result("pravilnoe-pitanie", 0.8, "nutrition", "Пищевой продукт или специализированное питание");

  // 11. Weaker signals → suggestions that need review.
  if (vitamin) return result("vitaminy-i-bady", 0.6, "vitamins.words", "Упоминание витаминов/минералов без формы выпуска");
  if (dosed && /(?<![\p{L}])(?:гель|спрей|капли|саше|сашет|эмульсия|мазь|раствор)(?![\p{L}])/u.test(n)) {
    return result("lekarstvennye-sredstva", 0.82, "medicine.dose-form", "Дозировка или концентрация вместе с формой (гель, спрей, капли и т. п.)");
  }
  if (dosed) return result("lekarstvennye-sredstva", 0.55, "medicine.dose-only", "Есть дозировка, но нет формы выпуска");
  if (/(?<![\p{L}])(?:саше|сашет|пакетики)(?![\p{L}])/u.test(n)) return result("vitaminy-i-bady", 0.45, "sachets", "Саше/пакетики без описания: это может быть лекарство или БАД");
  if (/(?<![\p{L}])(?:масло|бальзам)(?![\p{L}])/u.test(n)) return result("lechebnaya-kosmetika", 0.5, "oil-balm", "Масло/бальзам без указания назначения");
  if (has(n, "drops")) return result("lekarstvennye-sredstva", 0.5, "medicine.drops", "«Капли» без указания назначения");

  return result(null, 0, "unmatched", "Не найдено признаков ни одной категории");
}
