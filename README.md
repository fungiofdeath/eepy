# Eepy

Eeepy language for silly, tired kitties

Right now its some combination of lisps and schemes. Not sure what the final
result will look like.

# Language

## Booleans

The symbol `nil` represents false, all other values are truthy.

## Lists

Lists are either `nil`, or conses whose `cdr` is a list.

## Functions

Functions are called via `(`*fn* *args*\*`)`, where *args*\* corresponds with
*fn*'s parameters list.

### Built-in functions

The following functions are included:

- `+`, `-`, `*`, `/`, `<`, `<=`, `=`, `>`, `>=`, `/=` — mathematical functions
- `cons`, `car`, `cdr`, `null?` — list functions
- `eq?`, `not` — boolean functions
- `andf`, `orf` — function versions of `and` and `or` without short-circuiting
- `print` — output
- `compose` — higher-order functions

## `if`

### Syntax

`(if` *condition* *true-case* *false-case*`)`

**⟹** *result*

### Where
- *condition* is an expression
- *true-case* is an expression. it is only executed if *condition* is non-`nil`
- *false-case* is an expression. it is only executed if *condition* is `nil`
- *result* is the result of *true-case* if *condition* was non-`nil`, or the
  result of *false-case* if *condition* was `nil`.

## `let` / `let*` / `letrec*`

### SYNTAX

`(let` `(`*bindings*\*`)` *body*\*`)` **⟹** *body-result*

`(let*` `(`*bindings*\*`)` *body*\*`)` **⟹** *body-result*

`(letrec*` `(`*bindings*\*`)` *body*\*`)` **⟹** *body-result*

### Where

- *binding*\* is a list `(` *name* *value* `)`
- *name* is a symbol
- *value* is an expression. Within *body*, *name* is bound to the result of
  evaluating *value*
- *body*\* is a block of expression
- *body-result* is the result of the *body*\* block

### Description

`let` defines a set of "parallel" bindings. These bindings cannot reference
prior bindings in the same `let`.

`let*` defines a set of "serial" bindigs. These bindings can reference any
prior binding in the `let*`.

`letrec*` defines a set of mutually recursive bindings. These bindings can
reference themselves, any prior, or later binding in the `letrec*`. Circular
eager values are illegal, and trigger an error.

### See also

- `block` for a description of blocks

## `labels`

### Syntax

`(labels` `(`*function-binding*\*`)` *body*\*`)` **⟹** *body-result*

### Where

- *function-binding*\* is a list `(`*name* *parameter*\* *function-body*\*`)`
- *name* is the name of a function
- *parameter*\* is a parameter list
- *function-body*\* and *body*\* are blocks of expressions
- *body-result* is the result of the *body*\* block

### Description

`labels` defines a set of mutually-recursive functions that may be used within
*body*\*.

Every function bound by `letrec` may be recursive, and may refer to any other
function in the same `letrec` or already in scope, including ones defined before
it.

### See also

- `lambda` for a description of parameter lists
- `block` for a description on blocks

## `lambda`

### Syntax

`(lambda` *parameter*\* *body*\*`)`

**⟹** *closure*

### Where

- *parameter*\* is a parameter list
- *body*\* is a block of expressions
- *closure* is a closure that accepts arguments corresponding to *parameter*\*
  and returns the value of the *body*\* block.

### Definitions

- A **parameter list** is a list of symbols. None are evaluated.

### Description

`lambda` defines a closure with the specified parameters and body.

### See also

- `block` for a description on blocks

## `block`

### Syntax

`(block` **[**
**[** *expression*\* **]** *last-expression* **]**`)`

**⟹** *last-expression-value*

### Where

- *expression*\* is a list of expressions
- *last-expression* is an expression
- *last-expression-value* is the result of *last-expression*, or `nil` if none
  was provided

## `set!`

### Syntax

`(set!` *name* *value*`)`

**⟹** *value-result*

### Where

- *name* is a bound symbol, not evaluated.
- *value* is an expression. Its result is bound to *name*
- *value-result* is the result of *value*
