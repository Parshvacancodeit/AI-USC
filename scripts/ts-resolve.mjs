// Lets plain Node run scripts that import the app's .ts files (which use extensionless relative imports).
import { registerHooks } from "node:module";
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (err) {
      if (spec.startsWith(".") && !spec.endsWith(".ts")) return next(`${spec}.ts`, ctx);
      throw err;
    }
  },
});
