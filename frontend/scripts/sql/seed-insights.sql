-- Seed the curated Insights articles as real, editable CMS posts.

-- Paste into the CockroachDB SQL Shell (defaultdb).

-- Idempotent: ON CONFLICT (slug) DO NOTHING — safe to re-run, never clobbers admin edits.



INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b0$nigeria-2026-tax-what-changed$b0$, $b0$Nigeria's 2026 tax reform: what actually changed$b0$, $b0$Taxation$b0$, $b0$The new PAYE bands, reliefs, CIT rules and development levy; and what they mean for your business.$b0$, $b0$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1633158829585-23ba8f7c8caf.jpg$b0$, $b0$Litch Consulting$b0$, $b0$The Nigeria Tax Act 2026 is the most significant reset of the country's tax rules in years. For business owners and finance leaders, the changes are not just compliance housekeeping; they reshape how much tax you pay and where the opportunities to optimise now sit.

On personal income tax, the first ₦800,000 of annual income is now tax-free, and the bands run from 15% to 25%. Reliefs matter more than ever: pension contributions (8%), the National Housing Fund (2.5%), life assurance premiums, and a new rent relief of 20% of gross income capped at ₦500,000.

For companies, small businesses below the turnover threshold enjoy a 0% CIT rate; but the relief explicitly excludes professional-service firms, so many advisory businesses will not qualify. Medium and large companies also face a 4% development levy on assessable profits.

VAT holds at 7.5% with zero-rating reinforced on essentials, while withholding tax remains 5% on most services and 2% on goods. The practical takeaway: revisit your structure now. The businesses that treat this reform as a planning opportunity, rather than a filing chore, will protect real margin.$b0$, 'published', 6, $b0$Nigeria's 2026 tax reform: what actually changed | Litch Consulting$b0$, $b0$The new PAYE bands, reliefs, CIT rules and development levy; and what they mean for your business.$b0$, '2026-06-24')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b1$model-investors-trust$b1$, $b1$Building a financial model investors actually trust$b1$, $b1$Modelling$b1$, $b1$The assumptions, structure and detail that diligence teams look for; and the mistakes that lose the room.$b1$, $b1$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1460925895917-afdab827c52f.jpg$b1$, $b1$Litch Consulting$b1$, $b1$Every founder builds a model. Few build one investors trust. The difference is rarely the headline numbers; it's the discipline underneath them.

Start with a genuine three-statement model where the income statement, balance sheet and cash flow actually tie together. Investors test this quickly, and a model that doesn't balance signals a team that doesn't know its numbers cold.

Make your assumptions explicit and defensible. Every growth rate, margin and cost driver should trace back to something; historical performance, a comparable, or a clearly stated rationale. Bury assumptions inside formulas and you lose the ability to defend them under questioning.

Finally, build for scenarios. Diligence teams want to see the downside as much as the upside. A model that shows you understand the range of outcomes; and still has a path to returns; is what turns a pitch into a term sheet.$b1$, 'published', 5, $b1$Building a financial model investors actually trust | Litch Consulting$b1$, $b1$The assumptions, structure and detail that diligence teams look for; and the mistakes that lose the room.$b1$, '2026-06-10')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b2$messy-books-to-board-ready$b2$, $b2$From messy books to board-ready reporting$b2$, $b2$Reporting$b2$, $b2$How disciplined reporting changes the quality of every decision your leadership team makes.$b2$, $b2$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1454165804606-c3d57bc86b40.jpg$b2$, $b2$Litch Consulting$b2$, $b2$When reporting is late and inconsistent, every decision inherits that uncertainty. Leadership hedges, boards second-guess, and the finance function becomes a source of stress rather than clarity.

Board-ready reporting starts with a clean, disciplined close. Standardise the process, tighten reconciliations, and give every number an owner. The goal is a single, trusted version of the truth that arrives on time, every time.

Then add commentary. Numbers alone don't drive decisions; the story behind them does. A good management pack tells leadership what changed, why, and what to do about it.

The payoff compounds. Once leadership trusts the reporting, meetings shift from reconciling figures to making decisions; and that is where real value is created.$b2$, 'published', 4, $b2$From messy books to board-ready reporting | Litch Consulting$b2$, $b2$How disciplined reporting changes the quality of every decision your leadership team makes.$b2$, '2026-05-28')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b3$dashboards-that-drive-decisions$b3$, $b3$Dashboards that drive decisions, not just data$b3$, $b3$Analytics$b3$, $b3$Why most financial dashboards fail; and how to build ones your leadership team actually uses.$b3$, $b3$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1551288049-bebda4e38f71.jpg$b3$, $b3$Litch Consulting$b3$, $b3$Most dashboards die of neglect. They're built to display everything, so they help with nothing. A dashboard that tries to show all the data ends up driving no decisions.

Start from the decisions, not the data. What does leadership need to decide each week, each month, each quarter? Design the view around those questions and cut everything else.

Trust is everything. If the numbers on the dashboard don't reconcile to the accounts, it will be abandoned within weeks. Invest in the data pipeline and governance before the visuals.

Done well, analytics turns finance from a rear-view mirror into a windscreen; showing not just what happened, but where to steer next.$b3$, 'published', 5, $b3$Dashboards that drive decisions, not just data | Litch Consulting$b3$, $b3$Why most financial dashboards fail; and how to build ones your leadership team actually uses.$b3$, '2026-05-12')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b4$cash-flow-survival-guide$b4$, $b4$The cash-flow survival guide for growing businesses$b4$, $b4$Advisory$b4$, $b4$Profit is opinion; cash is fact. A practical framework for staying solvent while you scale.$b4$, $b4$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1554224155-6726b3ff858f.jpg$b4$, $b4$Litch Consulting$b4$, $b4$Plenty of profitable businesses fail. The reason is almost always the same: they run out of cash. Profit is an accounting opinion; cash is a fact, and it's the one that keeps the lights on.

The foundation is a rolling 13-week cash-flow forecast. It's short enough to be accurate and long enough to see trouble coming. Update it weekly and it becomes the single most useful tool in the business.

Then manage the working-capital levers: invoice faster, collect sooner, and negotiate terms that keep cash in the business longer. Small improvements across the cycle add up to real runway.

Cash discipline isn't about restricting growth; it's about funding it sustainably. The businesses that master it grow on their own terms, not their creditors'.$b4$, 'published', 4, $b4$The cash-flow survival guide for growing businesses | Litch Consulting$b4$, $b4$Profit is opinion; cash is fact. A practical framework for staying solvent while you scale.$b4$, '2026-04-30')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "post" (slug, title, tag, excerpt, cover_image, author, body, status, read_mins, seo_title, seo_description, published_at)
VALUES ($b5$forensic-signs-something-is-wrong$b5$, $b5$Five signs the numbers aren't telling the whole story$b5$, $b5$Forensic$b5$, $b5$When to bring in forensic accounting; and the quiet red flags that too often go unnoticed.$b5$, $b5$https://pub-f833c8f2eac548fea544f812455f9ba3.r2.dev/assets/1450101499163-c8848c66ca85.jpg$b5$, $b5$Litch Consulting$b5$, $b5$Fraud and leakage rarely announce themselves. They show up as small inconsistencies; a margin that drifts, a supplier that's a little too convenient, a reconciliation that never quite ties out.

Watch for margins that decline without an operational explanation. When revenue holds but profit erodes, something is leaking value between the two; and it's worth tracing.

Be wary of processes that depend on a single person, resist scrutiny, or lack a clear paper trail. Concentration and opacity are where risk hides.

Forensic accounting isn't only for crises. A periodic independent review quietly protects value, deters wrongdoing, and gives leadership confidence that the numbers can be trusted.$b5$, 'published', 5, $b5$Five signs the numbers aren't telling the whole story | Litch Consulting$b5$, $b5$When to bring in forensic accounting; and the quiet red flags that too often go unnoticed.$b5$, '2026-04-15')
ON CONFLICT (slug) DO NOTHING;



-- Verify:

SELECT slug, title, status, published_at FROM "post" ORDER BY published_at DESC;
