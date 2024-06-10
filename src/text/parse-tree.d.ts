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

type Sexp =
  | { $: 'number'; value: number; span: Span }
  | { $: 'string'; value: string; span: Span }
  | { $: 'quote'; exp: Sexp; span: Span }
  | { $: 'atom'; name: string; span: Span }
  | { $: 'list'; items: Sexp[]; span: Span }
  | { $: 'infix'; items: Sexp[]; span: Span }
  | { $: 'record'; items: Sexp[]; span: Span }
  | { $: 'error'; exp: Sexp | Token; span: Span }
  | {
      $: 'qatom';
      path: { name: string; span: Span }[];
      relative: boolean;
      span: Span;
    };
