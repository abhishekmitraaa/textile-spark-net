import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useLang, type Lang } from "@/lib/i18n";
import { codeVocabulary, type FieldType, type FormField, type SellerCategory, type Vocabulary } from "@/data/sellerCategories";
import { requirementSchemas as codeRequirementSchemas, type Field, type FieldType as RequirementFieldType, type Section } from "@/data/requirementSchemas";

// ─────────────────────────────────────────────────────────────
// Ranking F3 (2026-10-31): the category questions of both forms, from public.attribute_definitions.
//
// Super admins edit the questions in Cosora-Admin › Attributes; the forms rebuild today's structures from the
// active rows — a Vocabulary for the listing form (and the search filters), question sets for the requirement
// form — and fall back to the code lists (data/sellerCategories.ts, data/requirementSchemas.ts) when the read
// fails or returns nothing, so a form is never empty. Category and subcategory names and icons stay in code:
// admins edit questions, not the category tree.
// ─────────────────────────────────────────────────────────────

export interface AttributeDefinition {
  id: string;
  form: "product" | "requirement";
  category_id: string | null;
  subcategory_id: string | null;
  layer: "base" | "sub" | "common" | null;
  seller_type: SellerCategory["type"] | null;
  applies_to_subcategories: string[] | null;
  schema_key: string | null;
  section_title: string | null;
  section_position: number | null;
  key: string;
  label: string;
  label_hi: string | null;
  label_gu: string | null;
  kind: string;
  options: string[] | null;
  unit: string | null;
  placeholder: string | null;
  required: boolean;
  full_width: boolean;
  half: boolean;
  core: boolean;
  match_key: string | null;
  match_weight: number;
  position: number;
  active: boolean;
}

const COLUMNS =
  "id, form, category_id, subcategory_id, layer, seller_type, applies_to_subcategories, schema_key, section_title, " +
  "section_position, key, label, label_hi, label_gu, kind, options, unit, placeholder, required, full_width, half, core, " +
  "match_key, match_weight, position, active";
const PAGE = 1000; // PostgREST's row limit per request

/** Every active question of both forms, page by page. */
export async function fetchAttributeDefinitions(): Promise<AttributeDefinition[]> {
  const rows: AttributeDefinition[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("attribute_definitions").select(COLUMNS).eq("active", true)
      .order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as AttributeDefinition[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

/** The label in the reader's language when an admin set one; else the English, which the page dictionary translates. */
const labelFor = (r: AttributeDefinition, lang: Lang) =>
  (lang === "hi" && r.label_hi) || (lang === "gu" && r.label_gu) || r.label;

const byPosition = (a: AttributeDefinition, b: AttributeDefinition) => a.position - b.position || a.key.localeCompare(b.key);

function toFormField(r: AttributeDefinition, lang: Lang): FormField {
  return {
    id: r.key,
    label: labelFor(r, lang),
    type: r.kind as FieldType,
    ...(r.placeholder ? { placeholder: r.placeholder } : {}),
    ...(r.options ? { options: r.options } : {}),
    ...(r.required ? { required: true } : {}),
    ...(r.unit ? { unit: r.unit } : {}),
    ...(r.full_width ? { fullWidth: true } : {}),
    ...(r.applies_to_subcategories ? { appliesTo: r.applies_to_subcategories } : {}),
  };
}

/** The listing form's vocabulary from the rows: the code's category tree, the rows' questions. */
export function buildVocabulary(rows: AttributeDefinition[], lang: Lang = "en"): Vocabulary {
  const product = rows.filter((r) => r.form === "product" && r.active).sort(byPosition);
  const base = (type: SellerCategory["type"]) => product.filter((r) => r.layer === "base" && r.seller_type === type).map((r) => toFormField(r, lang));
  return {
    baseFields: { product: base("product"), service: base("service"), freelancer: base("freelancer") },
    categories: codeVocabulary.categories.map((c) => ({
      ...c,
      commonFields: product.filter((r) => r.layer === "common" && r.category_id === c.id).map((r) => toFormField(r, lang)),
      subCategories: c.subCategories.map((s) => ({
        ...s,
        fields: product.filter((r) => r.layer === "sub" && r.category_id === c.id && r.subcategory_id === s.id).map((r) => toFormField(r, lang)),
      })),
    })),
  };
}

/** The requirement form's question sets from the rows, in their sections. */
export function buildRequirementSchemas(rows: AttributeDefinition[], lang: Lang = "en"): Record<string, Section[]> {
  const req = rows.filter((r) => r.form === "requirement" && r.active);
  const out: Record<string, Section[]> = {};
  for (const schema of [...new Set(req.map((r) => r.schema_key as string))]) {
    const inSchema = req.filter((r) => r.schema_key === schema);
    const positions = [...new Set(inSchema.map((r) => r.section_position ?? 0))].sort((a, b) => a - b);
    out[schema] = positions.map((p) => {
      const fields = inSchema.filter((r) => (r.section_position ?? 0) === p).sort(byPosition);
      return {
        title: fields[0].section_title ?? "",
        fields: fields.map((r): Field => ({
          key: r.key,
          label: labelFor(r, lang),
          type: r.kind as RequirementFieldType,
          ...(r.placeholder ? { placeholder: r.placeholder } : {}),
          ...(r.options ? { options: r.options } : {}),
          ...(r.required ? { required: true } : {}),
          ...(r.half ? { half: true } : {}),
        })),
      };
    });
  }
  return out;
}

export interface VocabularyState {
  vocabulary: Vocabulary;
  requirementSchemas: Record<string, Section[]>;
  /** False while loading and when the code lists are standing in. */
  fromDatabase: boolean;
}

/** Both forms' questions, from the database when it answers, else from the code. */
export function useVocabulary(): VocabularyState {
  const lang = useLang();
  const { data } = useQuery({
    queryKey: ["attribute_definitions"],
    queryFn: fetchAttributeDefinitions,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  return useMemo(() => {
    const product = data?.some((r) => r.form === "product") ?? false;
    const requirement = data?.some((r) => r.form === "requirement") ?? false;
    return {
      vocabulary: product ? buildVocabulary(data!, lang) : codeVocabulary,
      requirementSchemas: requirement ? buildRequirementSchemas(data!, lang) : codeRequirementSchemas,
      fromDatabase: product,
    };
  }, [data, lang]);
}
