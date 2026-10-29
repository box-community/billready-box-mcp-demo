// Technical manifests stay available to the application and presenter, not customer attachment lists.
export function isCustomerDocument(doc: { name: string }) {
  return (
    /\.(pdf|docx?|xlsx?|png|jpe?g|txt)$/i.test(doc.name) &&
    !/^readme(?:\.|$)/i.test(doc.name)
  );
}
export function documentLabel(doc: { name: string }) {
  const name = doc.name.toLowerCase();
  if (name.endsWith("-email.txt")) return "Email draft";
  if (name.endsWith("-packet.pdf")) return "Supporting billing packet";
  if (name.startsWith("draft-") && name.endsWith(".pdf"))
    return "Draft invoice";
  if (name.includes("acceptance") && name.endsWith(".pdf"))
    return "Customer acceptance";
  if (name.includes("project-agreement")) return "Project agreement";
  if (name.includes("completion-report")) return "Completion report";
  return doc.name;
}
