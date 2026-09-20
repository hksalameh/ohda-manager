import { DocumentType, TemplateVersionStatus } from "@prisma/client";
import { prisma } from "./prisma";

export const CUSTODY_TEMPLATE_CODE = "CUSTODY_PERSONAL";

export type CustodyTemplateConfig = {
  organizationName: string;
  administrationLine: string;
  departmentLine: string;
  religiousPhrase: string;
  title: string;
  centerLabel: string;
  dateLabel: string;
  introText: string;
  itemCodeLabel: string;
  itemNameLabel: string;
  quantityLabel: string;
  receiverNameLabel: string;
  signatureLabel: string;
  employeeNoLabel: string;
  formCode: string;
  logoText: string;
  showPageNumber: boolean;
};

export const DEFAULT_CUSTODY_TEMPLATE_CONFIG: CustodyTemplateConfig = {
  organizationName: "جمعية المركز الإسلامي الخيرية",
  administrationLine: "الإدارة العامة – الدائرة المالية",
  departmentLine: "قسم اللوازم والمشتريات",
  religiousPhrase: "بسم الله الرحمن الرحيم",
  title: "سند تسليم خاص بالعهدة الشخصية",
  centerLabel: "اسم المركز",
  dateLabel: "التاريخ",
  introText: "تم تسليم المواد المذكورة أدناه للسيد",
  itemCodeLabel: "رقم المادة",
  itemNameLabel: "المـــــــادة",
  quantityLabel: "الكمية",
  receiverNameLabel: "اسـم المستلـم",
  signatureLabel: "التـوقيـــع",
  employeeNoLabel: "الرقم الوظيفي",
  formCode: "FIN/3/3/4",
  logoText: "جمعية\nالمركز\nالإسلامي",
  showPageNumber: true,
};

export function parseCustodyTemplateConfig(value: string | null | undefined): CustodyTemplateConfig {
  if (!value) return DEFAULT_CUSTODY_TEMPLATE_CONFIG;
  try {
    const parsed = JSON.parse(value) as Partial<CustodyTemplateConfig>;
    return { ...DEFAULT_CUSTODY_TEMPLATE_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CUSTODY_TEMPLATE_CONFIG;
  }
}

export async function ensureCustodyTemplate() {
  const template = await prisma.printTemplate.upsert({
    where: { code: CUSTODY_TEMPLATE_CODE },
    update: {
      name: "سند تسليم خاص بالعهدة الشخصية",
      documentType: DocumentType.CUSTODY,
      active: true,
    },
    create: {
      code: CUSTODY_TEMPLATE_CODE,
      name: "سند تسليم خاص بالعهدة الشخصية",
      documentType: DocumentType.CUSTODY,
      active: true,
    },
    include: { versions: { orderBy: { version: "desc" } } },
  });

  const published = template.versions.find((version) => version.status === TemplateVersionStatus.PUBLISHED);
  if (published) return published;

  const nextVersion = (template.versions[0]?.version ?? 0) + 1;
  return prisma.printTemplateVersion.create({
    data: {
      templateId: template.id,
      version: nextVersion,
      status: TemplateVersionStatus.PUBLISHED,
      name: `الإصدار ${nextVersion}`,
      paperSize: "A4",
      orientation: "portrait",
      rowsPerPage: 20,
      layoutJsonText: JSON.stringify(DEFAULT_CUSTODY_TEMPLATE_CONFIG),
      publishedAt: new Date(),
    },
  });
}

export async function getCustodyTemplateHistory() {
  await ensureCustodyTemplate();
  return prisma.printTemplate.findUnique({
    where: { code: CUSTODY_TEMPLATE_CODE },
    include: { versions: { orderBy: { version: "desc" } } },
  });
}
