export const ROLE_CODES = [
  "developer_control",
  "builder",
  "builder_control",
  "designer",
  "performer",
  "other",
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  developer_control:
    "Представитель застройщика (технического заказчика, эксплуатирующей организации или регионального оператора) по вопросам строительного контроля",
  builder: "Представитель лица, осуществляющего строительство",
  builder_control:
    "Представитель лица, осуществляющего строительство, по вопросам строительного контроля",
  designer: "Представитель лица, осуществляющего подготовку проектной документации",
  performer: "Представитель лица, выполнившего работы, подлежащие освидетельствованию",
  other: "Иные представители",
};

export const ORG_ROLE_CODES = ["developer", "builder", "designer", "performer"] as const;
export type OrgRoleCode = (typeof ORG_ROLE_CODES)[number];

export const ORG_ROLE_LABELS: Record<OrgRoleCode, string> = {
  developer: "Застройщик (технический заказчик)",
  builder: "Лицо, осуществляющее строительство",
  designer: "Лицо, осуществляющее подготовку проектной документации",
  performer: "Лицо, выполнившее работы (по умолчанию)",
};

export const QUALITY_DOC_TYPES = [
  "passport",
  "certificate",
  "declaration",
  "info_letter",
  "refusal_letter",
  "other",
] as const;
export type QualityDocType = (typeof QUALITY_DOC_TYPES)[number];

export const QUALITY_DOC_LABELS: Record<QualityDocType, string> = {
  passport: "Паспорт качества",
  certificate: "Сертификат соответствия",
  declaration: "Декларация о соответствии",
  info_letter: "Информационное письмо",
  refusal_letter: "Отказное письмо",
  other: "Прочее",
};
