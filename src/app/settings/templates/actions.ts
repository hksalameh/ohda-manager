"use server";

import { TemplateVersionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  CUSTODY_TEMPLATE_CODE,
  DEFAULT_CUSTODY_TEMPLATE_CONFIG,
  ensureCustodyTemplate,
  type CustodyTemplateConfig,
} from "@/lib/print-templates";

function text(formData: FormData, key: string, fallback: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export async function publishCustodyTemplate(formData: FormData) {
  await ensureCustodyTemplate();
  const template = await prisma.printTemplate.findUnique({
    where: { code: CUSTODY_TEMPLATE_CODE },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!template) throw new Error("تعذر العثور على قالب سند العهدة");

  const rowsPerPage = Number(formData.get("rowsPerPage"));
  if (!Number.isInteger(rowsPerPage) || rowsPerPage < 5 || rowsPerPage > 40) {
    throw new Error("عدد الصفوف في الصفحة يجب أن يكون بين 5 و40");
  }

  const orientationValue = formData.get("orientation");
  const orientation = orientationValue === "landscape" ? "landscape" : "portrait";

  const config: CustodyTemplateConfig = {
    organizationName: text(formData, "organizationName", DEFAULT_CUSTODY_TEMPLATE_CONFIG.organizationName),
    administrationLine: text(formData, "administrationLine", DEFAULT_CUSTODY_TEMPLATE_CONFIG.administrationLine),
    departmentLine: text(formData, "departmentLine", DEFAULT_CUSTODY_TEMPLATE_CONFIG.departmentLine),
    religiousPhrase: text(formData, "religiousPhrase", DEFAULT_CUSTODY_TEMPLATE_CONFIG.religiousPhrase),
    title: text(formData, "title", DEFAULT_CUSTODY_TEMPLATE_CONFIG.title),
    centerLabel: text(formData, "centerLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.centerLabel),
    dateLabel: text(formData, "dateLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.dateLabel),
    introText: text(formData, "introText", DEFAULT_CUSTODY_TEMPLATE_CONFIG.introText),
    itemCodeLabel: text(formData, "itemCodeLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.itemCodeLabel),
    itemNameLabel: text(formData, "itemNameLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.itemNameLabel),
    quantityLabel: text(formData, "quantityLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.quantityLabel),
    receiverNameLabel: text(formData, "receiverNameLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.receiverNameLabel),
    signatureLabel: text(formData, "signatureLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.signatureLabel),
    employeeNoLabel: text(formData, "employeeNoLabel", DEFAULT_CUSTODY_TEMPLATE_CONFIG.employeeNoLabel),
    formCode: text(formData, "formCode", DEFAULT_CUSTODY_TEMPLATE_CONFIG.formCode),
    logoText: text(formData, "logoText", DEFAULT_CUSTODY_TEMPLATE_CONFIG.logoText),
    showPageNumber: formData.get("showPageNumber") === "on",
  };

  const nextVersion = (template.versions[0]?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.printTemplateVersion.updateMany({
      where: { templateId: template.id, status: TemplateVersionStatus.PUBLISHED },
      data: { status: TemplateVersionStatus.ARCHIVED },
    });

    await tx.printTemplateVersion.create({
      data: {
        templateId: template.id,
        version: nextVersion,
        status: TemplateVersionStatus.PUBLISHED,
        name: `الإصدار ${nextVersion}`,
        paperSize: "A4",
        orientation,
        rowsPerPage,
        layoutJsonText: JSON.stringify(config),
        publishedAt: new Date(),
      },
    });
  });

  revalidatePath("/settings/templates");
}
