type Span = [number, number];

type Token = {
  $:
    | 'lparen'
    | 'rparen'
    | 'lbracket'
    | 'rbracket'
    | 'lbrace'
    | 'rbrace'
    | 'quote'
    | 'string'
    | 'atom'
    | 'eof';
  text: string | Symbol;
  span: Span;
};

type SexpNumber = { $: 'number'; value: number; span: Span };
type SexpString = { $: 'string'; value: string; span: Span };
type SexpQuote = { $: 'quote'; exp: Sexp; span: Span };
type SexpSAtom = { $: 'atom'; name: string; span: Span };
type SexpList = { $: 'list'; items: Sexp[]; span: Span };
type SexpInfix = { $: 'infix'; items: Sexp[]; span: Span };
type SexpRecord = { $: 'record'; items: Sexp[]; span: Span };
type SexpError = { $: 'error'; exp: Sexp | Token; span: Span };
type SexpQAtom = {
  $: 'qatom';
  path: { name: string; span: Span }[];
  relative: boolean;
  span: Span;
};

type Sexp =
  | SexpNumber
  | SexpString
  | SexpQuote
  | SexpSAtom
  | SexpList
  | SexpInfix
  | SexpRecord
  | SexpError
  | SexpQAtom;
