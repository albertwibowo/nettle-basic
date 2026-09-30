export type FieldType =
  | "text"
  | "email"
  | "integer"
  | "decimal"
  | "date"
  | "choice"
  | "boolean";

export interface FieldChoice {
  value: string | number | boolean;
  label?: string;
}

export interface ClientFieldDefinition {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  enabled: boolean;
  group: string;
  order: number;
  choices: FieldChoice[] | (string | number | boolean)[] | null;
  help_text: string;
}

export type ClientAttributes = Record<string, unknown>;

export interface PortfolioClient {
  id: string;
  name: string;
  attributes: ClientAttributes;
  created_at: string;
  updated_at?: string;
}

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "integer", label: "Integer" },
  { value: "decimal", label: "Decimal" },
  { value: "date", label: "Date" },
  { value: "choice", label: "Choice" },
  { value: "boolean", label: "Boolean" },
];

const GROUP_LABELS: Record<string, string> = {
  contact: "Contact",
  company: "Company Details",
  location: "Location",
  insurance: "Insurance",
  risk: "Risk",
  notes: "Notes",
};

export function groupLabel(group: string): string {
  if (!group) return "Other";
  return (
    GROUP_LABELS[group] ??
    group.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Group definitions preserving group/order sort from the API. */
export function groupDefinitions(
  definitions: ClientFieldDefinition[]
): { group: string; fields: ClientFieldDefinition[] }[] {
  const map = new Map<string, ClientFieldDefinition[]>();
  for (const def of definitions) {
    const key = def.group || "";
    const list = map.get(key);
    if (list) list.push(def);
    else map.set(key, [def]);
  }
  return Array.from(map.entries()).map(([group, fields]) => ({
    group,
    fields,
  }));
}

function choiceLabel(
  choices: ClientFieldDefinition["choices"],
  value: unknown
): string | null {
  if (!choices) return null;
  for (const item of choices) {
    if (typeof item === "object" && item !== null && "value" in item) {
      if (item.value === value) return item.label ?? String(item.value);
    } else if (item === value) {
      return String(item);
    }
  }
  return null;
}

export function formatAttributeValue(
  definition: ClientFieldDefinition,
  value: unknown
): string {
  if (value === null || value === undefined || value === "") return "—";

  switch (definition.field_type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "decimal": {
      const n = Number(value);
      if (Number.isNaN(n)) return String(value);
      const currencyKeys = new Set([
        "annual_revenue",
        "total_insured_value",
      ]);
      if (currencyKeys.has(definition.key)) {
        return `$${n.toLocaleString()}`;
      }
      return n.toLocaleString();
    }
    case "integer":
      return typeof value === "number"
        ? value.toLocaleString()
        : String(value);
    case "choice":
      return choiceLabel(definition.choices, value) ?? String(value);
    default:
      return String(value);
  }
}

/** Preferred columns for the portfolio list when those keys are enabled. */
export const LIST_COLUMN_KEYS = ["industry", "city", "country", "risk_rating"] as const;
