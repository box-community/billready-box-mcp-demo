import { AsyncLocalStorage } from "node:async_hooks";
import type { BoxMcpClient } from "./box-mcp.ts";
import type { Trace } from "./tracing.ts";
export type Employee = { id: string; name: string; email: string };
export type Workspace = { id: string; name: string };
export type EmployeeContext = {
  employee: Employee;
  workspace?: Workspace;
  mcp: BoxMcpClient;
  traces: Trace[];
  assertActive: () => void;
};
export const employeeContext = new AsyncLocalStorage<EmployeeContext>();
export const currentEmployee = () => employeeContext.getStore();
export function requireEmployee() {
  const scope = currentEmployee();
  if (!scope)
    throw Object.assign(Error("Sign in with Box first."), { status: 401 });
  scope.assertActive();
  return scope;
}
export const workspaceRoot = () =>
  currentEmployee()?.workspace?.id ||
  (!currentEmployee() && process.env.BILLREADY_ADAPTER !== "live"
    ? process.env.BOX_DEMO_ROOT_ID
    : undefined);
