-- Seed the SERVICE and FREELANCER halves of the taxonomy into public.categories.
--
-- 20260729194246 seeded the taxonomy tree from src/data/sellerCategories.ts but
-- took only the entries marked type: 'product' -- 9 parents, 93 children. The other 7 top-level
-- entries (6 service + 1 freelancer, 72 children) were left out, and nothing
-- since has added them.
--
-- That gap is not cosmetic, and it is not new scope: CategorySelector renders
-- ALL 16 entries grouped Products / Services / Freelancer, so a vendor can
-- already pick "Marketing, PR & Photography" today. resolveSubcategoryId then
-- finds no parent row, falls through to resolveCategoryId, and that regex only
-- knows garment words -- so the listing is saved with category_id = NULL. The
-- vendor picked a category and the database recorded nothing.
--
-- So this is not inventing categories vendors were never asked about; it is
-- finishing a seed that was half-applied. These names are copied verbatim from
-- sellerCategories.ts (generated from it, not retyped), which is what makes the
-- buyer picker, the vendor picker and this table one vocabulary.
--
-- Idempotent through the same categories_name_parent_uniq index the first seed
-- created, so re-running is safe.

-- Parents. grp = 'Taxonomy' marks a tree root, exactly as the product seed did.
insert into public.categories (name, grp, parent_id)
select v.name, 'Taxonomy', null
from (values
  ('Printing & Manufacturing Services'),
  ('Service Providers (Manufacturing & Fashion Ops)'),
  ('Logistics & Supply Chain'),
  ('IT, Software & SaaS'),
  ('Finance & Compliance Services'),
  ('Marketing, PR & Photography'),
  ('Freelancers & Job Workers')
) as v(name)
on conflict (name, parent_id) do nothing;

-- Children. grp carries the parent's name, matching the product seed's shape.
insert into public.categories (name, grp, parent_id)
select v.sub, v.parent, p.id
from (values
  ('Printing & Manufacturing Services', 'Printing Services'),
  ('Printing & Manufacturing Services', 'Embroidery Services'),
  ('Printing & Manufacturing Services', 'Fabric Dyeing'),
  ('Printing & Manufacturing Services', 'Processing & Finishing'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Stitching / Garmenting'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Cutting'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Packaging'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Quality Check (QC)'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Pattern Making / CAD'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Tech Pack Development'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Fashion Designing'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Fabric Sourcing'),
  ('Service Providers (Manufacturing & Fashion Ops)', 'Trims & Accessories Sourcing'),
  ('Logistics & Supply Chain', 'Logistics & Transportation'),
  ('Logistics & Supply Chain', 'Warehousing'),
  ('Logistics & Supply Chain', 'Import / Export Handling'),
  ('IT, Software & SaaS', 'App Development'),
  ('IT, Software & SaaS', 'ERP / SaaS Software'),
  ('IT, Software & SaaS', 'CRM & Automation'),
  ('IT, Software & SaaS', 'Accounting & Billing Software'),
  ('IT, Software & SaaS', 'B2B Directory Listings'),
  ('Finance & Compliance Services', 'Accounting Services'),
  ('Finance & Compliance Services', 'GST Filing'),
  ('Finance & Compliance Services', 'Income Tax Filing'),
  ('Finance & Compliance Services', 'Business Registration'),
  ('Finance & Compliance Services', 'Payroll & PF / ESIC'),
  ('Finance & Compliance Services', 'Budgeting & Forecasting'),
  ('Finance & Compliance Services', 'Fundraising Support'),
  ('Finance & Compliance Services', 'Loan Advisory'),
  ('Finance & Compliance Services', 'Inventory Valuation'),
  ('Finance & Compliance Services', 'Import / Export Compliance'),
  ('Finance & Compliance Services', 'Costing Consultation'),
  ('Finance & Compliance Services', 'Audit Support'),
  ('Finance & Compliance Services', 'Financial SOP Setup'),
  ('Marketing, PR & Photography', 'Brand Consulting'),
  ('Marketing, PR & Photography', 'Marketing Services'),
  ('Marketing, PR & Photography', 'E-commerce Services'),
  ('Marketing, PR & Photography', 'Marketplace Onboarding'),
  ('Marketing, PR & Photography', 'Brand Store Setup'),
  ('Marketing, PR & Photography', 'Social Media Marketing'),
  ('Marketing, PR & Photography', 'Performance Marketing'),
  ('Marketing, PR & Photography', 'Influencer Collaborations'),
  ('Marketing, PR & Photography', 'Public Relations (PR)'),
  ('Marketing, PR & Photography', 'Content Creation'),
  ('Marketing, PR & Photography', 'Catalogue & Listing'),
  ('Marketing, PR & Photography', 'SEO & Blogging'),
  ('Marketing, PR & Photography', 'Email Marketing'),
  ('Marketing, PR & Photography', 'SMS / WhatsApp Campaigns'),
  ('Marketing, PR & Photography', 'Photography & Videography'),
  ('Freelancers & Job Workers', 'Fashion Designing'),
  ('Freelancers & Job Workers', 'Tech Pack Creation'),
  ('Freelancers & Job Workers', 'Fabric & Trim Sourcing'),
  ('Freelancers & Job Workers', 'Marketing Strategy'),
  ('Freelancers & Job Workers', 'E-commerce Operations'),
  ('Freelancers & Job Workers', 'Performance & Influencer Marketing'),
  ('Freelancers & Job Workers', 'PR & Media'),
  ('Freelancers & Job Workers', 'Software & CRM Support'),
  ('Freelancers & Job Workers', 'Accounting & Bookkeeping'),
  ('Freelancers & Job Workers', 'Legal & Compliance'),
  ('Freelancers & Job Workers', 'Packaging Design & Procurement'),
  ('Freelancers & Job Workers', 'Photography & Videography'),
  ('Freelancers & Job Workers', 'Content Creation & Cataloging'),
  ('Freelancers & Job Workers', 'Model Coordination & Styling'),
  ('Freelancers & Job Workers', 'Reels & Campaign Shoots'),
  ('Freelancers & Job Workers', 'Warehouse & Logistics Management'),
  ('Freelancers & Job Workers', 'Label & Tag Customisation'),
  ('Freelancers & Job Workers', 'Product Sampling'),
  ('Freelancers & Job Workers', 'Trend Forecasting'),
  ('Freelancers & Job Workers', 'Brand Strategy Consulting'),
  ('Freelancers & Job Workers', 'UI/UX & Website Development'),
  ('Freelancers & Job Workers', 'SEO & Copywriting'),
  ('Freelancers & Job Workers', 'B2B Sales Enablement')
) as v(parent, sub)
join public.categories p on p.name = v.parent and p.parent_id is null
on conflict (name, parent_id) do nothing;
