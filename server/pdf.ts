import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import {
  DEMO_DATE,
  dateOffset,
  money,
  type Project,
  type Milestone,
} from "./domain.ts";
export async function makePdf(
  file: string,
  title: string,
  subtitle: string,
  sections: { title: string; text: string }[],
  draft = false,
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const doc = new PDFDocument({
    size: "LETTER",
    margins: { top: 52, bottom: 55, left: 54, right: 54 },
    info: { Title: title, Author: "Clearwave AV - fictional demo" },
  });
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  doc.rect(0, 0, 612, 12).fill("#284c46");
  doc
    .fillColor("#284c46")
    .font("Helvetica-Bold")
    .fontSize(15)
    .text("CLEARWAVE AV", 54, 45);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#718078")
    .text("Thoughtful spaces. Seamless technology.", 54, 68);
  if (draft)
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#ac6b39")
      .text("DRAFT", 438, 47, { width: 120, align: "right" });
  doc.moveTo(54, 100).lineTo(558, 100).strokeColor("#dce1db").stroke();
  doc
    .fillColor("#203c36")
    .font("Helvetica-Bold")
    .fontSize(26)
    .text(title, 54, 126, { width: 504 });
  doc
    .moveDown(0.45)
    .font("Helvetica")
    .fontSize(11)
    .fillColor("#63726a")
    .text(subtitle, { width: 504 });
  doc.moveDown(1.6);
  for (const s of sections) {
    if (doc.y > 620) doc.addPage();
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#284c46")
      .text(s.title.toUpperCase());
    doc
      .moveDown(0.5)
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#253a33")
      .text(s.text, { width: 504, lineGap: 5 });
    doc.moveDown(1.3);
  }
  doc
    .fontSize(8)
    .fillColor("#7c877f")
    .text(
      "SYNTHETIC CONFERENCE DEMO  |  No real transaction or legal signature",
      54,
      720,
      { width: 504, align: "center", lineBreak: false },
    );
  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return file;
}
export async function invoicePdf(
  file: string,
  p: Project,
  ms: Milestone[],
  reference: string,
) {
  const total = ms.reduce((s, m) => s + m.cents, 0);
  return makePdf(
    file,
    "Draft invoice",
    `${reference}  |  ${p.id}`,
    [
      {
        title: "From / Bill to",
        text: `Clearwave AV\n100 Example Way, Suite 200, Portland, OR 97205\nbilling@clearwave.example\n\n${p.client}\nAttn: ${p.contact}  |  ${p.email}`,
      },
      {
        title: "Invoice details",
        text: `Project: ${p.name}\nDate: ${DEMO_DATE}  |  Due: ${dateOffset(30)}\nTerms: Net 30 from issue. This draft has not been issued.`,
      },
      {
        title: "Services",
        text: ms
          .map(
            (m) =>
              `${p.id}-${m.id}  |  ${m.name}\nQuantity 1   x   ${money(m.cents)}   =   ${money(m.cents)}`,
          )
          .join("\n\n"),
      },
      {
        title: "Total",
        text: `Subtotal: ${money(total)}\nTax: $0 (synthetic demo assumption)\nTOTAL DRAFT AMOUNT: ${money(total)}`,
      },
      {
        title: "Review required",
        text: "Prepared for owner review. Approval saves the billing package only. No invoice is issued and no email is sent.",
      },
    ],
    true,
  );
}
