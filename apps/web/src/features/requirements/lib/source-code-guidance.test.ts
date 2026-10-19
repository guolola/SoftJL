// Keeps ordinary requirements free of permanent code warnings while recognizing pasted source.
import { expect, it } from "vitest";
import { looksLikeSourceCode } from "./source-code-guidance";
it.each(['用户登录后可以查看订单。', '系统使用 Java 和数据库，管理员可以导入文件。', '```\n用户可以预约会议室\n```'])("does not warn for requirements: %s", text => {
  expect(looksLikeSourceCode(text)).toBe(false);
});
it.each(['```typescript\nconst total = 2;\n```', 'def login(user):\n  return user', 'public class Order {\n}', 'function login() { return true; }'])("recognizes pasted code: %s", text => {
  expect(looksLikeSourceCode(text)).toBe(true);
});
