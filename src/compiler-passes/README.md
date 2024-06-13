# Compiler Passes

Naming convention:
 - Passes with higher numbers must come later.
 - Passes with the same number can go in either order.
 - 3+ digit numbers are used for easy expansion.

## Passes

### Resolution and Conversion (`000-resolution`)

This pass is pretty complex, and is basically responsible for converting the
s-expressions given by the parser into a proper AST.

This includes the following steps:
 - **Name resolution**:
   All atoms are renamed so that all shadowing is eliminated, and its possible
   to trivially determine binding location given a variable name. This is done
   by adding a unique ID for every binding. This is basically the
   [Barendregt Convention](https://en.wikipedia.org/wiki/De_Bruijn_index#Barendregt_convention).
 - **Module resolution and loading**:
   All modules referenced by this file are loaded into memory, parsed, and
   their symbols made available for reference. All references to an imported
   symbol have the same id.
 - **AST Conversion**:
   All calls to special forms are turned into the node corresponding to that
   form. All other calls are converted into a call node, literal into a literal
   node, etc. Basically, every syntactic element gets a node.
 - **Validation**:
   All of these steps may have invariants to which the user needs to conform.

### Name Lambdas (`100-name-lambdas`)

This pass ensures that all lambdas are bound to a name. Anonymous lambdas are
bound to new names.

To avoid capture problems, lambdas are bound just inside the nearest ancestor
binding form.

### Analyze Usages (`200-analyze-usages`)

Detect which names are used and rebound.

### Combine Let Variants (`200-combine-let-variants`)

Convert all `let` variations into `letrec*` nodes for later simplification.

### Flatten Forms (`300-flatten-forms`)

Simplify some weird cases in the code, like empty blocks or blocks with a
single expression and nested bindings.

### Compile `letrec*` (`400-compile-letrec`)

Lower all `letrec*` nodes into simpler nodes by computing variable dependencies
and reordering bindings. All eager expressions must be stored in a `let` after
this point (validation not implemented), and functions (the only lazy
expressions currently) must be stored in a `let` or `labels`.

Under most cases, this does not require mutation, but in some cases of
circular dependencies between variables and functions, variable initialization
may require a `set!`.

### CPS (`500-cps`)

Convert the AST into a CPS format. Eepy uses a double-barrelled CPS, meaning
that expressions have 2 continuations: one for usual returns and one for
exceptions / effects.

Continuation nodes are all stored in special nodes for improved optimization
later.
