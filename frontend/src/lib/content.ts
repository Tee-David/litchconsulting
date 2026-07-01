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
  email: "adenuga.saheed@gmail.com",
  phone: "+234 813 382 4779",
  phoneHref: "+2348133824779",
  location: "Lagos, Nigeria",
  nav: [
    { label: "Services", href: "/#services" },
    { label: "Approach", href: "/#process" },
    { label: "Insights", href: "/#insights" },
    { label: "Case Studies", href: "/#case-studies" },
    { label: "About", href: "/#about" },
  ],
  socials: [
    { label: "LinkedIn", href: "#" },
    { label: "X", href: "#" },
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
];

export const insights = {
  eyebrow: "Insights",
  title: "Insights that drive smarter decisions.",
  posts: [
    { tag: "Taxation", title: "Year-end tax planning: a founder's checklist", excerpt: "Practical moves to optimise your position before the books close.", image: U("1450101499163-c8848c66ca85", 800) },
    { tag: "Modelling", title: "Building a model investors actually trust", excerpt: "The assumptions, structure and detail diligence teams look for.", image: U("1460925895917-afdab827c52f", 800) },
    { tag: "Reporting", title: "From messy books to board-ready reporting", excerpt: "How disciplined reporting changes the quality of every decision.", image: U("1454165804606-c3d57bc86b40", 800) },
  ],
};

export const faqs = [
  { q: "What types of businesses do you work with?", a: "We partner with startups, professional practices, SMEs and established enterprises across sectors; anyone who wants their finances to be a strategic advantage rather than an afterthought." },
  { q: "How do you measure success?", a: "By the clarity and confidence our clients gain: on-time trusted reporting, defensible forecasts, an optimised tax position, and better decisions made faster." },
  { q: "Which services do you specialise in?", a: "Financial reporting, financial modelling, taxation planning and management, forensic accounting, data analytics, and broader accounting and advisory services; all under one roof." },
  { q: "How do I get started?", a: "Book a consultation. We'll assess your current financial position, understand your goals, and propose a tailored engagement." },
  { q: "Do you offer ongoing support?", a: "Yes. Many clients work with us on a retained basis for continuous reporting, advisory and compliance support." },
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
