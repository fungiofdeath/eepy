#set document(
	title: "Eepy Language Manual"
)

#set text(
	font: "Vollkorn",
	size: 10pt,
	number-type: "lining",
	hyphenate: false
)

#show math.equation: set text(
	font: "Libertinus Math",
	size: 1em + 1pt,
)

#show raw: set text(
	font: "Inconsolata",
	size: 1em + 2pt,
)

#set page(
	header-ascent: 1em,
	footer-descent: 1em,
	footer: align(center)[
		#line(length: 100%, stroke: 0.25pt)
		#context { counter(page).display("1") }
	],
)
#set par(justify: true)

#let chapter = {
	// unshadow
	let columnsfun = columns;
	(head, columns: 2, content) => [
		#page(header: [
			#head
			#h(1fr)
			#context { document.title }
			#line(length: 100%, stroke: 0.25pt)
		])[
			#heading(numbering: "1")[#head]
			#columnsfun(columns)[
				#content
			]
		]
		#pagebreak(weak: true)
	]
}

#let atom(name) = raw(name)
#let t = atom("t")
#let nil = atom("nil")

#chapter([Special Forms])[
	== _Special Form_ `block`
	=== Grammar
	`(block` _expressions_\*`)` $->$ _results_\*

	=== Types
	- _expressions_\* is a body
	- _results_\* is a multivalue

	=== Explanation
	Blocks are used to group sequences of expressions into a single expression.
	They return the value of the last expression, or #nil if there are no
	expressions. If the last expression returns multiple values, the block also
	returns the multiple values.

	The last expression (if any) is evaluated in tail position.

	=== Semantics
	#grid(
		columns: (1fr, 1fr),
		gutter: 1em,
		row-gutter: 1.5em,
		align: horizon + center,
		$ () / ( #raw("(block)") -> #nil ) $,
		$ ( #raw("(block") e\*#raw(")") -> emptyset \
				r -> overline(r_v)) /
			( #raw("(block") e\* space.fig r#raw(")")
				-> overline(r_v)) $
	)

	=== Side effects
	None.

	=== Errors
	None.

	#line(length: 100%)

	== _Special Form_ `cond`
	=== Grammar
	`(cond` *clause*\*`)` $->$ _results_\*

	/ clause: $:=$ `(`_condition_ _body_\*`)`

	=== Types
	- _condition_ is a general boolean expression
	- _body_\* is a body
	- _results_\* is a multivalue

	=== Explanation
	`cond` checks each clause's _condition_ until it finds one which returns
	a non-#nil value. If a clause's _condition_ is truthy, then its _body_\* is
	evaluated as a block. The last expression in the _body_\*'s result(s) are
	the result(s) of `cond`. The last expression in the _body_\* is invoked in
	tail position.

	If no _condition_ was non-#nil, then `cond` returns `nil`.

	=== Semantics
	#grid(
		columns: (1fr, 1fr),
		gutter: 1em,
		row-gutter: 1.5em,
		align: horizon + center,
		grid.cell(
			colspan: 2,
			$ () / ( #raw("(cond)" ) -> #nil) $,
		),
		$ ( c -> #nil \ #raw("(cond") r\*#raw(")") -> overline(v) ) /
			( #raw("(cond (")c space.fig b\*#raw(")") r\*#raw(")")
				-> overline(v) ) $,
		$ ( c -> c_v space.quad c_v equiv.not #nil \
				#raw("(block") b\*#raw(")") -> overline(b_v) ) /
			( #raw("(cond (")c space.fig b\*#raw(")") r\*#raw(")")
				-> overline(b_v) ) $,
	)

	=== Side effects
	None.

	=== Errors
	None.

	#line(length: 100%)

	== _Special Form_ `if`
	=== Grammar
	`(if` _condition_ _true-case_ *\[* _false-case_ *\]*`)` $->$ _results_\*

	=== Types
	- _condition_ is a general boolean expression
	- _true-case_ is an expression
	- _false-case_ is an expression. If it is omitted, its equivalent to #nil.
	- _results_\* is a multivalue

	=== Explanation
	`if` evaluates the _condition_, and then evaluates either the _true-case_ or
	the _false-case_. If the _condition_ returned a non-#nil value then
	_true-case_ is evaluated. Otherwise the _false-case_ is evaluated. The
	evaluated case's result(s) are returned.

	The evaluated case is evaluated in tail position.

	=== Semantics
	#grid(
		columns: (1fr, 1fr),
		gutter: 1em,
		row-gutter: 1.5em,
		align: horizon + center,
		grid.cell(
			colspan: 2,
			$ ( #raw("(if") c space.fig t #nil#raw(")") -> overline(v) ) /
				( #raw("(if") c space.fig t#raw(")") -> overline(v) ) $,
		),
		$ ( c &-> c_v space.quad c_v equiv.not #nil \
				t &-> overline(t_v) ) /
			( #raw("(if") c space.fig t space.fig f#raw(")") -> overline(t_v)) $,
		$ ( c &-> #nil \ f &-> overline(f_v) ) /
			( #raw("(if") c space.fig t space.fig f#raw(")") -> overline(f_v) ) $,
	)

	=== Side effects
	None.

	=== Errors
	None.
]
