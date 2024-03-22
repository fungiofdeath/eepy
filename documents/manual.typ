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

#show link: it => {
	text(fill: blue, underline(it))
}

#set page(
	header-ascent: 1em,
	footer-descent: 1em,
	footer: align(center)[
		#line(length: 100%, stroke: 0.25pt)
		#context { counter(page).display("1") }
	],
)

#set par(justify: true)
#set super(size: 10pt, typographic: false)

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

#let deflink(name) = context {
	let lbl = label(name);
	let (found,) = query(lbl);
	link(lbl, [#found])
}
#let llink(name, content) = context {
	link(label(name), content)
}
#let refl(name) = llink(name, name)
#let define(name, id: "", content) ={
	let ref = if id == "" { name } else { id }
	terms.item([#name #label(ref)], [\ #content])
}

#let atom(name) = raw(name)
#let t = atom("t")
#let nil = atom("nil")
#let char(name) = [\#\\#raw(name)]


#chapter([Typographical Conventions and Notation])[
	Evaluation is represented via $x -> r$.

	Macro expansion and desugaring is represented by $x => y$.

	$overline(x)$ is used to indicate a multivalue.

	Characters are written as #char("enter") or #char("c").

	Terms that end with a \* or #super("+") are a list of subterms. \* indicates
	the list can have 0 or more items, while #super("+") indicates the list must
	have at least 1 item.
]

#chapter([Types])[
	== Booleans
	Booleans are handled via the symbols #t and #nil. These symbols are
	self-evaluating: #t $->$ #t and #nil $->$ #nil.

	Every value is a valid generalized boolean. #nil is still used for false,
	and all other values are "truthy".

	== Strings
	Strings are encoded using UTF-8 internally. Some invisible unicode
	characters may be allowed, but not all. String literals may contain any
	sequence of visible unicode characters --- with the following exceptions:
	- #char("double-quote")
	- #char("backslash")
	- #char("tilde")

	=== Escapes
	The above characters may be escaped by prefixing them with #char("backslash").
	Illegal characters may be written with the sequence `\u(`_hhhh_`)`,
	where _hhhh_ are hex digits corresponding to the codepoint.

	=== Interpolation
	An expression _e_'s result may be interpolated into a string by writing
	`~`_e_. More complex interpolations can be written using the `fmt` function.
	`~`_e_ is equivalent to the `~a` format specifier.

	=== Errors
	Any string literal that includes an illegal character or invalid escape
	triggers a read error.
]

#chapter([Special Forms])[
	== _Special Form_ `block`
	=== Grammar
	`(block` _expressions_\*`)` $->$ _results_\*

	=== Types
	- _expressions_\* is a #refl("body")
	- _results_\* is a multivalue

	=== Explanation
	`block` returns the #llink("bodyresults")[body results] of its
	_expressions_\*.

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
	- _condition_ is a #llink("genbool")[generalized boolean] expression
	- _body_\* is a #refl("body")
	- _results_\* is a multivalue

	=== Explanation
	`cond` evaluates each clause's _condition_ until it finds a #refl("truthy")
	one.  If a clause's _condition_ is truthy, then `cond` returns the
	#llink("bodyresults")[body results] of its _body_\*. The last expression of the
	_body_\* is invoked in tail position.

	If no _condition_ was truthy, then `cond` returns `nil`.

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

	=== Other Notes
	`cond` can be desugared into `if` via:
	#block(
		$ &#raw("(cond (")c space.fig b\*#raw(")") r\*#raw(")") \ =>
			&#raw("(if") c #raw("(block") b\*#raw(") (cond") r\*#raw("))") $
	)

	#line(length: 100%)

	== _Special Form_ `if`
	=== Grammar
	`(if` _condition_ _true-case_ *\[* _false-case_ *\]*`)` $->$ _results_\*

	=== Types
	- _condition_ is a #llink("genbool")[generalized boolean] expression
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

	=== Other Notes
	`if` can be desugared into `cond` via:
	#block(
		$ &#raw("(if") c space.fig t space.fig f#raw(")") \ =>
			&#raw("(cond (")c space.fig t#raw(") (")#t f#raw("))") $
	)

	#line(length: 100%)

	== _Special Forms_ `let`, `let*`, `letrec*`, `labels`
	=== Grammar
	`(let     (`*binding*\*`) `_body\*_`)` $->$ _result_\*

	`(let*    (`*binding*\*`) `_body\*_`)` $->$ _result_\*

	`(letrec* (`*binding*\*`) `_body\*_`)` $->$ _result_\*

	`(labels  (`*function*\*`) `_body\*_`)` $->$ _result_\*

	/ binding: $:=$ _name_ $|$ `(`_name_ _value-body_\*`)`
	/ function: $:=$ `(`_name_ `(`_parameters_\*`)` _function-body_\*`)`

	=== Types
	- _body_\* is a #refl("body")
	- _name_ is a symbol
	- _value-body_\* is a #refl("body")
	- _parameters_\* is a #llink("paramlist")[parameter list]
	- _function-body_\* is a #refl("body")

	=== Explanation
	`let` #llink("independent")[independently] binds each _name_ to the
	#llink("bodyresults")[body result] of its _value-body_\*.

	`let*` binds each _name_ to the
	#llink("bodyresults")[body result] of its _value-body_\*.
	Each _value-body_\* can refer to any _name_ bound earlier in
	the bindings.

	`letrec*` binds each _name_ to the #llink("bodyresults")[body result] of
	its _value-body_\*. _names_ cannot be reused --- every
	binding _name_ must be unique.  Each _value-body_\* may refer to
	any _name_ bound in the bindings, unless:
	- the reference to _name_ is not within a `fn` expression,
	- the referenced _name_ is bound after the _value-body_\* is evaluated, and
	- the referenced _name_'s _value-body_\* is not an #refl("atomic") or
		`fn` expression.
	
	`labels` binds each _name_ to a function with the
	mentioned _parameters_\* and _function-body_\*. Each _function-body_\*
	may refer to any _name_ bound in the bindings.

	Each let variants' bindings are established lexically within their _body_\*.
	They each return the #llink("bodyresults")[body results] of their _body_\*.
	The _value-bodies_\* are evaluated and bound to their respective _names_ in
	order.  The last expression in the _body_\* is evaluated in tail position.
]

#chapter([Definitions])[
	#define(id: "atomic", "Atomic")[
		- (adj. of an expression): A constant expression
	]
	#define(id: "body", "Body")[
		A sequence of forms which are evaluated in order and together --- i.e.
		when any form is evaluated, all forms all evaluated.
	]
	#define(id: "bodyresults", "Body Result(s)")[
		The result(s) of the last form of some #refl("body"), or #nil if the body
		contains no forms.
	]
	#define(id: "falsy", "Falsy")[
		Equalling #nil.
	]
	#define(id: "genbool", "Generalized boolean")[
		A value where #nil represents falsity and any other value represents truth.
	]
	#define(id: "independent", "Independent")[
		- (adj. of a set of bindings): A set of bindings where each binding has
			a unique name and cannot refer to any other binding in the set.
	]
	#define(id: "paramlist", "Parameter List")[
		A list of symbols for use as parameters to a function.
	]
	#define(id: "selfeval", "Self Evaluating")[
		A symbol or other object that --- when evaluated --- returns itself.
		Most values are self-evaluating, as well as #t and #nil.
	]
	#define(id: "truthy", "Truthy")[
		- (for a #llink("genbool")[generalized boolean]): Being non-#nil.
		- (for a boolean): Equalling #t.
	]
]
