/// <reference path="./gensym.d.ts"/>

type ValueOld = null | string | number;
type ValueBareAtom = { $: 'atom'; name: string };
type ValueError = { $: 'error' };
type ValueList = { $: 'list'; items: Value[] };
type ValueNumber = { $: 'number'; value: string };
type ValueQualAtom = { $: 'qatom'; path: { name: string }[] };
type ValueString = { $: 'string'; value: string };

type Value =
  | ValueOld
  | ValueBareAtom
  | ValueError
  | ValueList
  | ValueNumber
  | ValueQualAtom
  | ValueString;

type Name = Gensym<string>;

type ExprLiteral = { $: 'literal'; value: Value };
type ExprVar = { $: 'var'; name: Name };
type ExprSet = { $: 'set!'; name: Name; value: Expr; k?: Name };
type ExprBlock = { $: 'block'; subforms: Expr[] };
type ExprKCall = { $: 'kcall'; fn: Expr; args: Expr[] };
type ExprCall = {
  $: 'call';
  fn: Expr;
  args: Expr[];
  arg_k?: ExprVar;
  arg_h?: ExprVar;
};
type ExprIf = { $: 'if'; cond: Expr; then: Expr; otherwise: Expr };
type ExprLet = { $: 'let'; binds: Bind[]; body: Expr };
type ExprLetStar = { $: 'let*'; binds: Bind[]; body: Expr };
type ExprKLabels = { $: 'klabels'; binds: Bind[]; body: Expr };
type ExprLabels = { $: 'labels'; binds: Bind[]; body: Expr };
type ExprLetrec = { $: 'letrec*'; binds: Bind[]; body: Expr };
type ExprKLambda = { $: 'klambda'; params: Name[]; body: Expr };
type ExprLambda = {
  $: 'lambda';
  params: Name[];
  body: Expr;
  param_h?: Name;
  param_k?: Name;
};
type ExprError = { $: 'error' };

type Expr =
  | ExprLiteral
  | ExprVar
  | ExprSet
  | ExprBlock
  | ExprKCall
  | ExprCall
  | ExprIf
  | ExprLet
  | ExprLetStar
  | ExprKLabels
  | ExprLabels
  | ExprLetrec
  | ExprKLambda
  | ExprLambda
  | ExprError;

type Bind = { name: Name; value: Expr };
