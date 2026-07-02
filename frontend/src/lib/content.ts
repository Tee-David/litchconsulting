/**
 * Central content model for the Litch Consulting site.
 * Curated finance copy — single source of truth for every section.
 */

const U = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const site = {
  name: "Litch Consulting",
  legalName: "Litch Consulting Limited",
  tagline: "Clarity in every number.",
  description:
    "Litch Consulting is a professional finance firm delivering financial reporting, modelling, taxation, forensic accounting and advisory that turn numbers into confident decisions.",
  email: "info@litchconsulting.com",
  phone: "+234 813 382 4779",
  phoneHref: "+2348133824779",
  location: "Lagos, Nigeria",
  nav: [
    { label: "Home", href: "/" },
    { label: "Services", href: "/services" },
    { label: "Case Studies", href: "/case-studies" },
    { label: "Insights", href: "/insights" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  socials: [
    { label: "WhatsApp", href: "https://wa.me/2348133824779" },
    { label: "LinkedIn", href: "#" },
    { label: "Instagram", href: "#" },
  ],
};

export const heroSlides = [
  {
    eyebrow: "Financial reporting & advisory",
    headline: "Financial clarity that drives real growth.",
    sub: "We turn complex financials into clear, actionable insight; so you can make confident decisions and grow with certainty.",
    image: U("1554224155-6726b3ff858f", 1600),
  },
  {
    eyebrow: "Modelling & data analytics",
    headline: "Numbers that tell you where to go next.",
    sub: "Forecasts, valuations and dashboards built on rigorous modelling; a clear line of sight into every scenario ahead.",
    image: U("1460925895917-afdab827c52f", 1600),
  },
  {
    eyebrow: "Taxation & forensic accounting",
    headline: "Compliance handled. Risks uncovered.",
    sub: "Stay compliant, optimise your tax position, and surface what the numbers are hiding; all under one roof.",
    image: U("1454165804606-c3d57bc86b40", 1600),
  },
];

export const partners = [
  "MERIDIAN",
  "Northbridge",
  "APEX CAPITAL",
  "Vantage",
  "CLEARWATER",
  "Sterling & Co",
];

export const valueCards = [
  {
    title: "Report smarter, decide faster",
    body: "Clean, standards-compliant financial statements that give leadership a single, trusted version of the truth.",
    image: U("1450101499163-c8848c66ca85", 800),
  },
  {
    title: "Model every scenario",
    body: "Dynamic financial models and forecasts that stress-test your plans before you commit real capital.",
    image: U("1554224154-26032ffc0d07", 800),
  },
  {
    title: "Stay compliant, stay ahead",
    body: "Proactive tax planning and regulatory compliance that protect your margins and your peace of mind.",
    image: U("1556742049-0cfed4f6a45d", 800),
  },
  {
    title: "Uncover what numbers hide",
    body: "Forensic accounting that traces leakage, quantifies risk and gives you defensible answers.",
    image: U("1454165804606-c3d57bc86b40", 800),
  },
  {
    title: "Turn data into decisions",
    body: "Dashboards and analytics that convert raw financial data into clear, actionable insight.",
    image: U("1551288049-bebda4e38f71", 800),
  },
  {
    title: "Fund your next move",
    body: "Investor-ready models, packs and metrics that give diligence teams confidence in your numbers.",
    image: U("1460925895917-afdab827c52f", 800),
  },
  {
    title: "Close faster, every month",
    body: "Streamlined month-end processes that turn a 15-day close into days, not weeks.",
    image: U("1554224155-6726b3ff858f", 800),
  },
  {
    title: "Advisory that goes further",
    body: "A finance partner in the room for the decisions that shape your growth, not just the numbers.",
    image: U("1600880292203-757bb62b4baf", 800),
  },
];

export const builtFor = {
  eyebrow: "Built for finance leaders",
  title: "Trusted by businesses that take their numbers seriously.",
  body: "From high-growth startups to established enterprises, Litch Consulting embeds financial discipline into how you operate; tested in the field, trusted at the boardroom table.",
  points: [
    {
      title: "Grow with confidence",
      body: "Board-ready reporting and forecasting that make funding and growth decisions defensible.",
    },
    {
      title: "Operate efficiently",
      body: "Streamlined finance processes and controls that reduce cost, error and month-end pain.",
    },
    {
      title: "Future-ready finance",
      body: "Analytics and tooling that keep you ahead of compliance, risk and opportunity.",
    },
  ],
};

export const solutions = {
  eyebrow: "Our services",
  title: "One firm for the full financial picture.",
  items: [
    {
      no: "01",
      kind: "Reporting",
      title: "Financial reporting",
      body: "IFRS-aligned statements, management accounts and investor reporting that leadership and lenders can rely on.",
      image: U("1454165804606-c3d57bc86b40", 900),
    },
    {
      no: "02",
      kind: "Advisory",
      title: "Financial modelling",
      body: "Three-statement models, valuations and scenario planning to pressure-test strategy before you act.",
      image: U("1460925895917-afdab827c52f", 900),
    },
    {
      no: "03",
      kind: "Compliance",
      title: "Taxation planning & management",
      body: "Tax strategy, filings and optimisation that keep you compliant while protecting your bottom line.",
      image: U("1633158829585-23ba8f7c8caf", 900),
    },
    {
      no: "04",
      kind: "Assurance",
      title: "Forensic accounting",
      body: "Investigative accounting that uncovers discrepancies, quantifies loss and stands up to scrutiny.",
      image: U("1450101499163-c8848c66ca85", 900),
    },
    {
      no: "05",
      kind: "Insight",
      title: "Data analytics",
      body: "Dashboards and financial intelligence that turn raw data into decisions you can defend.",
      image: U("1551288049-bebda4e38f71", 900),
    },
  ],
};

export const impact = {
  eyebrow: "Measurable impact",
  title: "Transforming numbers into impactful results.",
  body: "A snapshot of where clients typically start; and where disciplined financial management takes them.",
  chart: [
    { label: "Reporting accuracy", value: 42, color: "#0a196d" },
    { label: "Forecast reliability", value: 33, color: "#4c6ef5" },
    { label: "Cost & tax efficiency", value: 25, color: "#b8c4f0" },
  ],
  before: [
    "Fragmented, late financial reporting",
    "Decisions made without reliable forecasts",
    "Unmanaged tax and compliance exposure",
  ],
  after: [
    "One trusted, on-time source of truth",
    "Scenario-tested, board-ready forecasts",
    "Optimised, fully compliant tax position",
  ],
};

export const stats = [
  { value: 12, suffix: "+", label: "Years of combined expertise" },
  { value: 300, suffix: "+", label: "Engagements delivered" },
  { value: 95, suffix: "%", label: "Client retention rate" },
  { value: 24, suffix: "/7", label: "Advisory when it matters" },
];

export const process = {
  eyebrow: "How we work",
  title: "From vision to financial clarity, in four steps.",
  steps: [
    { no: "01", title: "Discover & assess", body: "We map your financial position, goals and gaps in a focused discovery session." },
    { no: "02", title: "Strategise & plan", body: "We design a tailored roadmap across reporting, modelling and tax." },
    { no: "03", title: "Execute & deliver", body: "We build the reports, models and controls; and put them to work." },
    { no: "04", title: "Monitor & elevate", body: "We track outcomes and refine, keeping your finances ahead of the curve." },
  ],
};

export const grow = {
  eyebrow: "Why Litch",
  title: "We help you grow smarter, faster, and stronger.",
  body: "Tailored financial consulting designed to elevate your business performance.",
  cards: [
    { title: "Business strategy development", body: "Financial strategy tied directly to how your business creates value." },
    { title: "Financial & investment planning", body: "Plans and forecasts that make capital decisions clear and defensible." },
    { title: "Risk & compliance positioning", body: "Controls and compliance that protect margin and reputation." },
  ],
};

export const scrollHighlight = {
  lead: "We believe",
  text: "Great financial decisions start with clarity; clean numbers, honest insight, and a partner who translates complexity into confidence, so your business can move forward without hesitation.",
};

export const audiences = {
  eyebrow: "Who we help",
  title: "Financial guidance for individuals and organisations alike.",
  cards: [
    { tag: "Individuals", title: "Personal financial clarity", body: "Tax planning, wealth structuring and reporting for high-earning professionals.", image: U("1573496359142-b8d87734a5a2", 900) },
    { tag: "Professionals", title: "Practice & partner finance", body: "Financial management built around the realities of professional practices.", image: U("1600880292203-757bb62b4baf", 900) },
    { tag: "Startups", title: "Fundraise-ready finance", body: "Models, metrics and reporting that stand up to investor due diligence.", image: U("1519389950473-47ba0277781c", 900) },
    { tag: "Enterprises", title: "Enterprise advisory", body: "Group reporting, forensic assurance and analytics at scale.", image: U("1497366216548-37526070297c", 900) },
    { tag: "SMEs", title: "Growth-stage finance", body: "Bookkeeping, reporting and cash-flow discipline that scales with your business.", image: U("1552664730-d307ca884978", 900) },
    { tag: "Nonprofits", title: "Grant & fund accounting", body: "Transparent fund reporting and compliance that satisfy donors and regulators.", image: U("1521737604893-d14cc237f11d", 900) },
    { tag: "Real estate", title: "Property & project finance", body: "Development appraisals, project cash flows and investor-grade reporting.", image: U("1486406146926-c627a92ad1ab", 900) },
    { tag: "Family offices", title: "Wealth & succession", body: "Consolidated reporting, tax structuring and succession planning across generations.", image: U("1507003211169-0a1dd7228f2d", 900) },
  ],
};

export const gallery = [
  { image: U("1554224155-6726b3ff858f", 800), text: "Reporting" },
  { image: U("1460925895917-afdab827c52f", 800), text: "Modelling" },
  { image: U("1454165804606-c3d57bc86b40", 800), text: "Analytics" },
  { image: U("1556742049-0cfed4f6a45d", 800), text: "Taxation" },
  { image: U("1450101499163-c8848c66ca85", 800), text: "Forensics" },
  { image: U("1600880292203-757bb62b4baf", 800), text: "Advisory" },
  { image: U("1551288049-bebda4e38f71", 800), text: "Dashboards" },
  { image: U("1521791136064-7986c2920216", 800), text: "Partnership" },
];

export const testimonials = [
  {
    quote:
      "Before Litch, our reporting was always late and never trusted. Now the board gets one clear picture, and our decisions have never been sharper.",
    name: "Adaeze Okafor",
    role: "CFO, Retail Group",
  },
  {
    quote:
      "Their financial model gave us the confidence to raise. Investors could see we knew our numbers cold.",
    name: "Tunde Adeyemi",
    role: "Founder, FinTech Startup",
  },
  {
    quote:
      "The forensic review uncovered leakage we didn't know existed. It paid for itself many times over.",
    name: "Grace Mensah",
    role: "MD, Manufacturing",
  },
  {
    quote:
      "Litch turned our tax function from a source of stress into a genuine competitive advantage. Calm, precise, dependable.",
    name: "Ibrahim Bello",
    role: "Finance Director, Logistics",
  },
  {
    quote:
      "We finally understand our unit economics. Every board meeting now starts from a place of clarity rather than confusion.",
    name: "Chiamaka Eze",
    role: "COO, Healthtech",
  },
  {
    quote:
      "Responsive, rigorous and genuinely invested in our growth. It feels like having a finance partner, not just a vendor.",
    name: "Daniel Osei",
    role: "Managing Partner, Advisory",
  },
];

export const caseStudies = [
  {
    tag: "Success story",
    title: "Reporting overhaul for a scaling retail group",
    body: "By rebuilding their reporting and forecasting, Litch cut month-end from 15 days to 4 and gave leadership real-time visibility across regions.",
    image: U("1552664730-d307ca884978", 1200),
    stat: "-73%",
    statLabel: "month-end close time",
  },
  {
    tag: "Success story",
    title: "A fundraise-ready model for a fintech startup",
    body: "We built a three-statement model and investor pack that stood up to diligence, helping the founders close their Series A with conviction.",
    image: U("1460925895917-afdab827c52f", 1200),
    stat: "$4.2M",
    statLabel: "Series A secured",
  },
  {
    tag: "Success story",
    title: "Forensic review recovers hidden leakage",
    body: "A forensic accounting engagement traced and quantified revenue leakage across a manufacturer's supply chain, recovering value that had gone unnoticed for years.",
    image: U("1454165804606-c3d57bc86b40", 1200),
    stat: "18%",
    statLabel: "margin recovered",
  },
  {
    tag: "Success story",
    title: "Tax restructuring for a logistics group",
    body: "We restructured the group's tax position across entities, unlocking legitimate savings and turning compliance from a burden into an advantage.",
    image: U("1556742049-0cfed4f6a45d", 1200),
    stat: "₦120M",
    statLabel: "annual tax saved",
  },
  {
    tag: "Success story",
    title: "Analytics dashboards for a healthtech",
    body: "A unified analytics layer gave leadership live visibility into unit economics, ending months of guesswork at the board table.",
    image: U("1551288049-bebda4e38f71", 1200),
    stat: "1 source",
    statLabel: "of truth, live",
  },
  {
    tag: "Success story",
    title: "Cash-flow turnaround for an SME",
    body: "A 13-week cash-flow model and disciplined controls took the business from firefighting to a stable, fundable footing.",
    image: U("1454165804606-c3d57bc86b40", 1200),
    stat: "90 days",
    statLabel: "runway restored",
  },
  {
    tag: "Success story",
    title: "Board-ready reporting for an NGO",
    body: "Transparent fund accounting and donor reporting gave the organisation the credibility to secure its next round of grants.",
    image: U("1521737604893-d14cc237f11d", 1200),
    stat: "100%",
    statLabel: "grant compliance",
  },
  {
    tag: "Success story",
    title: "Valuation support for an exit",
    body: "A defensible valuation and data room helped the founders negotiate from strength and close a clean, confident exit.",
    image: U("1507003211169-0a1dd7228f2d", 1200),
    stat: "1.7x",
    statLabel: "above first offer",
  },
];

/**
 * Extra detail for the case-study pages, in the SAME order as `caseStudies`.
 * Kept parallel so the home carousel data stays untouched.
 */
export const caseStudyDetails = [
  {
    slug: "reporting-overhaul-retail-group",
    challenge: "A fast-scaling retail group had reporting that was always late and never fully trusted, leaving leadership flying blind across regions.",
    approach: "We rebuilt the reporting and forecasting stack, standardised the close process, and introduced regional management packs with clear commentary.",
    results: ["Month-end close cut from 15 days to 4", "One trusted source of truth across regions", "Board decisions made from live data, not guesswork"],
  },
  {
    slug: "fundraise-ready-model-fintech",
    challenge: "A fintech startup needed to raise but lacked a model and investor pack that could withstand serious diligence.",
    approach: "We built a documented three-statement model, defined the key metrics, and packaged an investor-ready narrative and data room.",
    results: ["$4.2M Series A secured", "Model passed investor due diligence", "Founders negotiating from a position of clarity"],
  },
  {
    slug: "forensic-review-hidden-leakage",
    challenge: "A manufacturer suspected value was leaking across its supply chain but couldn't locate or quantify it.",
    approach: "A forensic accounting engagement traced transactions end to end, quantified the leakage, and documented a defensible evidence trail.",
    results: ["18% margin recovered", "Leakage sources identified and closed", "Controls introduced to prevent recurrence"],
  },
  {
    slug: "tax-restructuring-logistics",
    challenge: "A logistics group carried an inefficient tax position across multiple entities, treating compliance as pure cost.",
    approach: "We restructured the group's tax affairs within the law, aligned filings across entities, and built an ongoing compliance calendar.",
    results: ["₦120M in annual tax saved", "Compliant filings across all entities", "Tax turned into a managed advantage"],
  },
  {
    slug: "analytics-dashboards-healthtech",
    challenge: "A healthtech's leadership spent months guessing at unit economics with no shared view of performance.",
    approach: "We unified finance, sales and operations data into live dashboards tailored to how the leadership team makes decisions.",
    results: ["A single live source of truth", "Unit economics finally visible", "Board meetings starting from clarity"],
  },
  {
    slug: "cash-flow-turnaround-sme",
    challenge: "An SME was firefighting cash, with no visibility beyond the current week and no path to funding.",
    approach: "We built a rolling 13-week cash-flow model, tightened controls, and created a fundable financial footing.",
    results: ["90 days of runway restored", "Weekly cash visibility established", "Business positioned to raise"],
  },
  {
    slug: "board-ready-reporting-ngo",
    challenge: "An NGO needed transparent fund accounting and donor reporting to secure its next round of grants.",
    approach: "We implemented fund accounting, built donor-ready reports, and ensured full compliance with grant conditions.",
    results: ["100% grant compliance", "Donor confidence restored", "Next grant round secured"],
  },
  {
    slug: "valuation-support-exit",
    challenge: "Founders preparing to exit needed a defensible valuation and clean data room to negotiate from strength.",
    approach: "We prepared a well-supported valuation, organised the data room, and coached the founders through diligence.",
    results: ["Closed 1.7x above the first offer", "A clean, confident diligence process", "A defensible valuation throughout"],
  },
] as const;

export const insights = {
  eyebrow: "Insights",
  title: "Insights that drive smarter decisions.",
  posts: [
    {
      slug: "nigeria-2026-tax-what-changed",
      tag: "Taxation",
      title: "Nigeria's 2026 tax reform: what actually changed",
      excerpt: "The new PAYE bands, reliefs, CIT rules and development levy; and what they mean for your business.",
      image: U("1633158829585-23ba8f7c8caf", 1200),
      date: "2026-06-24",
      author: "Litch Consulting",
      readMins: 6,
      body: [
        "The Nigeria Tax Act 2026 is the most significant reset of the country's tax rules in years. For business owners and finance leaders, the changes are not just compliance housekeeping; they reshape how much tax you pay and where the opportunities to optimise now sit.",
        "On personal income tax, the first ₦800,000 of annual income is now tax-free, and the bands run from 15% to 25%. Reliefs matter more than ever: pension contributions (8%), the National Housing Fund (2.5%), life assurance premiums, and a new rent relief of 20% of gross income capped at ₦500,000.",
        "For companies, small businesses below the turnover threshold enjoy a 0% CIT rate; but the relief explicitly excludes professional-service firms, so many advisory businesses will not qualify. Medium and large companies also face a 4% development levy on assessable profits.",
        "VAT holds at 7.5% with zero-rating reinforced on essentials, while withholding tax remains 5% on most services and 2% on goods. The practical takeaway: revisit your structure now. The businesses that treat this reform as a planning opportunity, rather than a filing chore, will protect real margin.",
      ],
    },
    {
      slug: "model-investors-trust",
      tag: "Modelling",
      title: "Building a financial model investors actually trust",
      excerpt: "The assumptions, structure and detail that diligence teams look for; and the mistakes that lose the room.",
      image: U("1460925895917-afdab827c52f", 1200),
      date: "2026-06-10",
      author: "Litch Consulting",
      readMins: 5,
      body: [
        "Every founder builds a model. Few build one investors trust. The difference is rarely the headline numbers; it's the discipline underneath them.",
        "Start with a genuine three-statement model where the income statement, balance sheet and cash flow actually tie together. Investors test this quickly, and a model that doesn't balance signals a team that doesn't know its numbers cold.",
        "Make your assumptions explicit and defensible. Every growth rate, margin and cost driver should trace back to something; historical performance, a comparable, or a clearly stated rationale. Bury assumptions inside formulas and you lose the ability to defend them under questioning.",
        "Finally, build for scenarios. Diligence teams want to see the downside as much as the upside. A model that shows you understand the range of outcomes; and still has a path to returns; is what turns a pitch into a term sheet.",
      ],
    },
    {
      slug: "messy-books-to-board-ready",
      tag: "Reporting",
      title: "From messy books to board-ready reporting",
      excerpt: "How disciplined reporting changes the quality of every decision your leadership team makes.",
      image: U("1454165804606-c3d57bc86b40", 1200),
      date: "2026-05-28",
      author: "Litch Consulting",
      readMins: 4,
      body: [
        "When reporting is late and inconsistent, every decision inherits that uncertainty. Leadership hedges, boards second-guess, and the finance function becomes a source of stress rather than clarity.",
        "Board-ready reporting starts with a clean, disciplined close. Standardise the process, tighten reconciliations, and give every number an owner. The goal is a single, trusted version of the truth that arrives on time, every time.",
        "Then add commentary. Numbers alone don't drive decisions; the story behind them does. A good management pack tells leadership what changed, why, and what to do about it.",
        "The payoff compounds. Once leadership trusts the reporting, meetings shift from reconciling figures to making decisions; and that is where real value is created.",
      ],
    },
    {
      slug: "dashboards-that-drive-decisions",
      tag: "Analytics",
      title: "Dashboards that drive decisions, not just data",
      excerpt: "Why most financial dashboards fail; and how to build ones your leadership team actually uses.",
      image: U("1551288049-bebda4e38f71", 1200),
      date: "2026-05-12",
      author: "Litch Consulting",
      readMins: 5,
      body: [
        "Most dashboards die of neglect. They're built to display everything, so they help with nothing. A dashboard that tries to show all the data ends up driving no decisions.",
        "Start from the decisions, not the data. What does leadership need to decide each week, each month, each quarter? Design the view around those questions and cut everything else.",
        "Trust is everything. If the numbers on the dashboard don't reconcile to the accounts, it will be abandoned within weeks. Invest in the data pipeline and governance before the visuals.",
        "Done well, analytics turns finance from a rear-view mirror into a windscreen; showing not just what happened, but where to steer next.",
      ],
    },
    {
      slug: "cash-flow-survival-guide",
      tag: "Advisory",
      title: "The cash-flow survival guide for growing businesses",
      excerpt: "Profit is opinion; cash is fact. A practical framework for staying solvent while you scale.",
      image: U("1554224155-6726b3ff858f", 1200),
      date: "2026-04-30",
      author: "Litch Consulting",
      readMins: 4,
      body: [
        "Plenty of profitable businesses fail. The reason is almost always the same: they run out of cash. Profit is an accounting opinion; cash is a fact, and it's the one that keeps the lights on.",
        "The foundation is a rolling 13-week cash-flow forecast. It's short enough to be accurate and long enough to see trouble coming. Update it weekly and it becomes the single most useful tool in the business.",
        "Then manage the working-capital levers: invoice faster, collect sooner, and negotiate terms that keep cash in the business longer. Small improvements across the cycle add up to real runway.",
        "Cash discipline isn't about restricting growth; it's about funding it sustainably. The businesses that master it grow on their own terms, not their creditors'.",
      ],
    },
    {
      slug: "forensic-signs-something-is-wrong",
      tag: "Forensic",
      title: "Five signs the numbers aren't telling the whole story",
      excerpt: "When to bring in forensic accounting; and the quiet red flags that too often go unnoticed.",
      image: U("1450101499163-c8848c66ca85", 1200),
      date: "2026-04-15",
      author: "Litch Consulting",
      readMins: 5,
      body: [
        "Fraud and leakage rarely announce themselves. They show up as small inconsistencies; a margin that drifts, a supplier that's a little too convenient, a reconciliation that never quite ties out.",
        "Watch for margins that decline without an operational explanation. When revenue holds but profit erodes, something is leaking value between the two; and it's worth tracing.",
        "Be wary of processes that depend on a single person, resist scrutiny, or lack a clear paper trail. Concentration and opacity are where risk hides.",
        "Forensic accounting isn't only for crises. A periodic independent review quietly protects value, deters wrongdoing, and gives leadership confidence that the numbers can be trusted.",
      ],
    },
  ],
};

export type InsightPost = (typeof insights.posts)[number];

export const faqs = [
  { q: "What types of businesses do you work with?", a: "We partner with startups, professional practices, SMEs and established enterprises across sectors; anyone who wants their finances to be a strategic advantage rather than an afterthought." },
  { q: "How do you measure success?", a: "By the clarity and confidence our clients gain: on-time trusted reporting, defensible forecasts, an optimised tax position, and better decisions made faster." },
  { q: "Which services do you specialise in?", a: "Financial reporting, financial modelling, taxation planning and management, forensic accounting, data analytics, and broader accounting and advisory services; all under one roof." },
  { q: "How do I get started?", a: "Book a consultation. We'll assess your current financial position, understand your goals, and propose a tailored engagement." },
  { q: "Do you offer ongoing support?", a: "Yes. Many clients work with us on a retained basis for continuous reporting, advisory and compliance support." },
  { q: "Are you up to date with the 2026 tax reforms?", a: "Yes. Our tax advice reflects the Nigeria Tax Act 2026, including the new PAYE bands and reliefs, VAT rules, company income tax changes and the development levy." },
  { q: "Can you work with our existing accounting software?", a: "Absolutely. We work with your current stack; QuickBooks, Xero, Sage, ERPNext and others; and improve the process and controls around it rather than forcing a switch." },
  { q: "How do you keep our financial data secure?", a: "We treat financial information with strict confidentiality, use encrypted transmission and restricted access, and share documents only through secure channels." },
  { q: "Do you work with businesses outside Lagos?", a: "Yes. We're based in Lagos but work with clients across Nigeria and beyond, delivering consultations and services remotely over secure video or phone." },
  { q: "What does a typical engagement cost?", a: "It depends on scope and complexity. After a free consultation we propose a clear, tailored engagement so you know exactly what to expect before we begin." },
];

export const cta = {
  title: "Ready to take control of your financial future?",
  body: "Book a consultation and let's build the clarity, compliance and confidence your business deserves.",
};

export const bookingSteps = {
  eyebrow: "How it works",
  title: "Book your consultation in three simple steps.",
  body: "Getting started is easy. Follow these steps to connect with a Litch advisor who fits your needs; from anywhere, anytime.",
  steps: [
    {
      no: "01",
      title: "Pick a date and time",
      body: "Choose a slot that works for you from our live availability. It takes less than a minute.",
    },
    {
      no: "02",
      title: "Share a few details",
      body: "Tell us which service you're interested in and a little about your goals so we come prepared.",
    },
    {
      no: "03",
      title: "Meet your advisor",
      body: "Join a secure Google Meet or phone call and get clear, tailored financial guidance.",
    },
  ],
};

/** Dedicated service pages: /services and /services/[slug]. */
export const services = [
  {
    slug: "financial-reporting",
    kind: "Reporting",
    name: "Financial reporting",
    tagline: "One trusted version of the truth, on time, every time.",
    overview:
      "We produce IFRS-aligned financial statements, management accounts and investor reporting that leadership, lenders and boards can rely on. Clean books and a disciplined close turn reporting from a monthly scramble into a strategic asset.",
    image: U("1454165804606-c3d57bc86b40", 1200),
    useCases: [
      { title: "Board-ready management accounts", body: "Monthly packs with commentary that tell leadership what the numbers actually mean." },
      { title: "Lender & investor reporting", body: "Covenant tracking and stakeholder reports that keep financing relationships healthy." },
      { title: "Faster month-end close", body: "Streamlined processes that cut a 15-day close down to days, not weeks." },
    ],
    deliverables: ["IFRS-aligned financial statements", "Monthly management accounts", "Cash-flow & covenant reporting", "Close-process design & controls"],
    faqs: [
      { q: "Do you work with our existing accounting software?", a: "Yes; we work with your current stack (QuickBooks, Xero, Sage, ERPNext and others) and improve the process around it." },
      { q: "Can you help us get audit-ready?", a: "Absolutely. We prepare clean, well-supported statements and schedules that stand up to external audit." },
    ],
  },
  {
    slug: "financial-modelling",
    kind: "Advisory",
    name: "Financial modelling",
    tagline: "Pressure-test every decision before you commit capital.",
    overview:
      "Dynamic three-statement models, valuations and scenario planning that give you a clear line of sight into every path ahead; whether you're raising, expanding or restructuring.",
    image: U("1460925895917-afdab827c52f", 1200),
    useCases: [
      { title: "Fundraise-ready models", body: "Investor-grade models and packs that stand up to due diligence." },
      { title: "Scenario & sensitivity analysis", body: "Stress-test assumptions so you understand the range of outcomes before you act." },
      { title: "Business valuation", body: "Defensible valuations to support fundraising, M&A or an exit." },
    ],
    deliverables: ["Three-statement financial model", "Valuation & investor pack", "Scenario & sensitivity analysis", "Budgeting & forecasting"],
    faqs: [
      { q: "Will investors take the model seriously?", a: "Our models follow the structure, assumptions and detail diligence teams expect; clear, auditable and defensible." },
      { q: "Do we own the model afterwards?", a: "Yes. You keep a fully documented, editable model your team can maintain." },
    ],
  },
  {
    slug: "taxation-planning-management",
    kind: "Compliance",
    name: "Taxation planning & management",
    tagline: "Stay compliant, optimise your position, sleep at night.",
    overview:
      "End-to-end tax strategy, filings and optimisation aligned to the Nigeria Tax Act 2026; keeping you compliant across PAYE, VAT, CIT, WHT and development levy while protecting your bottom line.",
    image: U("1633158829585-23ba8f7c8caf", 1200),
    useCases: [
      { title: "Corporate tax compliance", body: "CIT, VAT and WHT filings handled accurately and on time, every cycle." },
      { title: "Tax-efficient structuring", body: "Legitimate structuring that reduces your effective rate across entities." },
      { title: "PAYE & payroll tax", body: "Payroll tax computed correctly under the 2026 bands and reliefs." },
    ],
    deliverables: ["Tax registration & filings", "Tax planning & structuring", "PAYE / payroll tax management", "Audit & dispute support"],
    faqs: [
      { q: "Are you up to date with the 2026 tax reforms?", a: "Yes; our advice reflects the Nigeria Tax Act 2026, including the new PAYE bands, reliefs, CIT rules and development levy." },
      { q: "Can you represent us in a tax audit?", a: "We support you through audits and disputes with well-documented, defensible positions." },
    ],
  },
  {
    slug: "forensic-accounting",
    kind: "Assurance",
    name: "Forensic accounting",
    tagline: "Uncover what the numbers are hiding.",
    overview:
      "Investigative accounting that uncovers discrepancies, quantifies loss and stands up to scrutiny; from suspected fraud and revenue leakage to disputes and due diligence.",
    image: U("1450101499163-c8848c66ca85", 1200),
    useCases: [
      { title: "Fraud investigation", body: "Trace, quantify and document irregularities with a defensible evidence trail." },
      { title: "Revenue leakage reviews", body: "Find and recover value slipping through the cracks in your operations." },
      { title: "Dispute & litigation support", body: "Independent analysis and expert reporting for disputes and claims." },
    ],
    deliverables: ["Forensic investigation & report", "Revenue leakage analysis", "Litigation & dispute support", "Fraud risk assessment"],
    faqs: [
      { q: "Is the engagement confidential?", a: "Completely. Forensic work is handled with strict confidentiality and a clear chain of evidence." },
      { q: "Can your findings be used in court?", a: "Yes; our reports are prepared to a standard that withstands legal and regulatory scrutiny." },
    ],
  },
  {
    slug: "data-analytics",
    kind: "Insight",
    name: "Data analytics",
    tagline: "Turn raw financial data into decisions you can defend.",
    overview:
      "Dashboards and financial intelligence that give leadership live visibility into performance, unit economics and risk; so every board meeting starts from clarity, not guesswork.",
    image: U("1551288049-bebda4e38f71", 1200),
    useCases: [
      { title: "Executive dashboards", body: "Live KPIs and financial dashboards tailored to how your leadership decides." },
      { title: "Unit economics & profitability", body: "Understand what actually drives margin across products, regions and customers." },
      { title: "Automated reporting", body: "Replace manual spreadsheets with automated, trustworthy reporting pipelines." },
    ],
    deliverables: ["Financial dashboards & BI", "Unit-economics analysis", "Reporting automation", "Data quality & governance"],
    faqs: [
      { q: "Which tools do you build on?", a: "We build on the tools you already own where possible, and recommend fit-for-purpose BI where it helps." },
      { q: "Can you connect our systems?", a: "Yes; we integrate accounting, sales and operations data into a single source of truth." },
    ],
  },
  {
    slug: "general-advisory",
    kind: "Advisory",
    name: "Accounting & advisory",
    tagline: "A finance partner in the room for the decisions that matter.",
    overview:
      "Broad accounting and advisory support; from bookkeeping and controls to strategic finance and growth planning; giving you a dependable finance function without the overhead of building one.",
    image: U("1600880292203-757bb62b4baf", 1200),
    useCases: [
      { title: "Outsourced finance function", body: "Bookkeeping, reconciliations and controls run reliably on your behalf." },
      { title: "Strategic finance advisory", body: "A partner for pricing, capital, cost and growth decisions." },
      { title: "Systems & process setup", body: "Stand up the tools, processes and controls a scaling business needs." },
    ],
    deliverables: ["Bookkeeping & reconciliations", "Financial controls & process", "Strategic finance advisory", "Systems implementation"],
    faqs: [
      { q: "Can you act as our finance team?", a: "Yes; many clients use us as their outsourced finance function on a retained basis." },
      { q: "Do you work with small businesses?", a: "We work with businesses of every size, scaling our support to where you are." },
    ],
  },
] as const;

export type Service = (typeof services)[number];

export const about = {
  eyebrow: "About Litch",
  title: "Deep financial expertise, delivered with clarity.",
  intro:
    "Litch Consulting Limited is a professional finance firm helping businesses make informed decisions, stay compliant, and grow with confidence. We combine rigorous financial expertise with practical, business-focused solutions; delivering not just reports, but actionable insight tailored to each client.",
  mission:
    "To bring clarity to every number, so our clients can make confident decisions, mitigate risk, and drive sustainable growth.",
  values: [
    { title: "Clarity first", body: "We translate complexity into insight you can act on; no jargon, no guesswork." },
    { title: "Rigour always", body: "Every figure is defensible, every position well-supported, every deadline met." },
    { title: "Genuinely partnered", body: "We work as an extension of your team, invested in your outcomes, not just the engagement." },
    { title: "Under one roof", body: "Reporting, modelling, tax and forensic expertise integrated for a holistic view." },
  ],
  credentials: [
    "Chartered accountants & tax specialists",
    "IFRS-aligned reporting expertise",
    "Nigeria Tax Act 2026 fluency",
    "Forensic & data-analytics capability",
  ],
  team: [
    { name: "Mustapha Saheed", role: "Founder & Principal", bio: "Leads Litch's advisory practice, bringing deep experience across reporting, tax and financial strategy.", image: U("1560250097-0b93528c311a", 600) },
    { name: "Adaeze Okafor", role: "Head of Reporting", bio: "Turns complex financials into board-ready clarity for scaling businesses.", image: U("1573496359142-b8d87734a5a2", 600) },
    { name: "Tunde Adeyemi", role: "Modelling & Advisory", bio: "Builds investor-grade models and advises founders through fundraises and growth.", image: U("1519085360753-af0119f7cbe7", 600) },
    { name: "Grace Mensah", role: "Forensic & Assurance", bio: "Leads forensic engagements that uncover risk and stand up to scrutiny.", image: U("1580489944761-15a19d654956", 600) },
  ],
};

export const contactPage = {
  eyebrow: "Contact us",
  title: "Let's talk about your numbers.",
  intro:
    "Tell us a little about your business and what you need. We'll get back to you quickly to arrange a conversation.",
};

const LEGAL_UPDATED = "2 July 2026";
export const legalImage = U("1450101499163-c8848c66ca85", 1200);

export const legal = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    updated: LEGAL_UPDATED,
    intro:
      "This Privacy Policy explains how Litch Consulting Limited collects, uses, and protects the personal information you share with us through this website and our services.",
    sections: [
      { heading: "Information we collect", body: [
        "We collect information you provide directly; such as your name, email address, phone number, company details, and any information contained in messages, enquiries, booking requests, or documents you send us.",
        "We also collect limited technical information automatically, including your IP address, browser type, device information, and how you interact with the site, through cookies and similar technologies.",
      ] },
      { heading: "How we use your information", body: [
        "We use your information to respond to enquiries, arrange and deliver consultations, provide our financial services, send information you request, improve our website, and meet our legal and regulatory obligations.",
        "Where you upload financial documents through a secure portal, we use them solely to provide the services you have engaged us for.",
      ] },
      { heading: "How we protect your information", body: [
        "We apply appropriate technical and organisational measures to safeguard your information, including encrypted transmission and restricted access. Financial documents are treated with strict confidentiality.",
        "No method of transmission or storage is completely secure, but we take reasonable steps to protect your data and to limit access to those who need it to serve you.",
      ] },
      { heading: "Sharing your information", body: [
        "We do not sell your personal information. We may share it with trusted service providers who help us operate the site and deliver our services, and where required by law or regulation.",
      ] },
      { heading: "Your rights", body: [
        "You may request access to, correction of, or deletion of your personal information, and you may object to certain processing. To exercise these rights, contact us using the details below.",
      ] },
      { heading: "Contact us", body: [
        "If you have questions about this Privacy Policy or how we handle your information, email info@litchconsulting.com.",
      ] },
    ],
  },
  {
    slug: "terms-and-conditions",
    title: "Terms & Conditions",
    updated: LEGAL_UPDATED,
    intro:
      "These Terms & Conditions govern your use of the Litch Consulting website. By using this site, you agree to these terms.",
    sections: [
      { heading: "Use of this website", body: [
        "You may use this website for lawful purposes only. You agree not to use it in any way that could damage, disable, or impair the site or interfere with anyone else's use of it.",
      ] },
      { heading: "No financial advice without engagement", body: [
        "The content, tools, calculators, and articles on this website are provided for general information only and do not constitute financial, tax, accounting, or legal advice. Financial tools give estimates based on the inputs you provide and should not be relied upon as a substitute for professional advice.",
        "A formal advisory relationship with Litch Consulting begins only when we agree an engagement in writing.",
      ] },
      { heading: "Intellectual property", body: [
        "All content on this website, including text, graphics, logos, and design, is owned by or licensed to Litch Consulting Limited and is protected by applicable laws. You may not reproduce or redistribute it without our permission.",
      ] },
      { heading: "Limitation of liability", body: [
        "To the fullest extent permitted by law, Litch Consulting is not liable for any loss or damage arising from your use of, or reliance on, this website or the general information and tools it contains.",
      ] },
      { heading: "Third-party links", body: [
        "This website may contain links to third-party sites. We are not responsible for the content or practices of those sites and provide the links for convenience only.",
      ] },
      { heading: "Changes to these terms", body: [
        "We may update these Terms from time to time. Continued use of the site after changes are posted constitutes acceptance of the updated Terms.",
      ] },
    ],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    updated: LEGAL_UPDATED,
    intro:
      "This Cookie Policy explains how Litch Consulting uses cookies and similar technologies on this website.",
    sections: [
      { heading: "What cookies are", body: [
        "Cookies are small text files stored on your device when you visit a website. They help the site function, remember your preferences, and understand how the site is used.",
      ] },
      { heading: "How we use cookies", body: [
        "We use essential cookies to make the site work (for example, to keep you signed in to secure areas), preference cookies to remember choices such as light or dark mode, and analytics cookies to understand how visitors use the site so we can improve it.",
      ] },
      { heading: "Managing cookies", body: [
        "You can control and delete cookies through your browser settings. Disabling some cookies may affect how parts of the site function, such as staying signed in to the client portal.",
      ] },
      { heading: "Contact us", body: [
        "If you have questions about our use of cookies, email info@litchconsulting.com.",
      ] },
    ],
  },
] as const;
