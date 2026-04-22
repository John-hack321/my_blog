---
title: MicroPy Compiler — Parser Documentation
published: 2025-01-01
description: A complete guide to how the MicroPy recursive descent parser works, with code examples, AST diagrams, and explanations of every grammar rule.
tags: [MicroPy, Compiler, Parser, Documentation]
category: Compiler Construction
draft: false
---

## Overview

The MicroPy parser is **Phase 2** of the compiler pipeline. It takes the flat list of tokens produced by the lexer and builds an **Abstract Syntax Tree (AST)** — a tree of objects that represents the structure and meaning of the program.

```
Source Code  →  [Lexer]  →  Token Stream  →  [Parser]  →  AST
```

The parser is a **hand-written Recursive Descent Parser**, also called a **top-down predictive parser** or **LL(1) parser**. This is the most widely taught parsing technique in universities and is used in real-world compilers like Go and early versions of GCC.

---

## The Two Files

The parser is split into two files, each with a distinct job:

| File | Job |
|---|---|
| `parser/nodes.py` | Defines the **data structures** (node classes) that make up the AST |
| `parser/parser.py` | Contains the **logic** that reads tokens and builds the AST |

Think of `nodes.py` as the blueprint and `parser.py` as the builder.

---

## Understanding AST Nodes

Every construct in MicroPy maps to a **node** — a Python object that holds exactly the information needed to represent that construct.

### Literal Nodes

These are the **leaf nodes** of the tree. They have no children — they just hold a value.

```python
@dataclass
class NumberNode(Node):
    value: str = ""     # e.g. "42"

@dataclass
class StringNode(Node):
    value: str = ""     # e.g. "hello"

@dataclass
class BooleanNode(Node):
    value: str = ""     # "True" or "False"

@dataclass
class IdentifierNode(Node):
    name: str = ""      # e.g. "result", "num1"
```

### Expression Nodes

These hold **other nodes** as children. They always have two sides and an operator.

```python
@dataclass
class BinaryOpNode(Node):
    left:  Any = None   # left side — another node
    op:    str = ""     # "+", "-", "*", "/", "==", "<", etc.
    right: Any = None   # right side — another node

@dataclass
class LogicalOpNode(Node):
    left:  Any = None   # left condition
    op:    str = ""     # "and" or "or"
    right: Any = None   # right condition
```

**Example:** `num1 + num2` becomes:

```
BinaryOpNode(op="+")
├── IdentifierNode → num1
└── IdentifierNode → num2
```

### Statement Nodes

These represent complete lines of MicroPy code.

```python
@dataclass
class AssignmentNode(Node):
    name:  str = ""    # variable name on the left
    value: Any = None  # expression on the right

@dataclass
class PrintNode(Node):
    value: Any = None  # what to print

@dataclass
class IfNode(Node):
    condition:  Any           = None
    then_block: List[Any]     = field(default_factory=list)
    else_block: Optional[Any] = None   # None if no else

@dataclass
class WhileNode(Node):
    condition: Any       = None
    body:      List[Any] = field(default_factory=list)

@dataclass
class BuiltinCallNode(Node):
    func_name: str = ""    # "int", "input", "str", "float"
    argument:  Any = None  # the argument passed in
```

### The Root Node

```python
@dataclass
class ProgramNode(Node):
    statements: List[Any] = field(default_factory=list)
```

Every MicroPy program is a `ProgramNode` containing a flat list of top-level statements. This is the entry point of the entire tree.

---

## How the Parser Works

### The Token Pointer

Just like the lexer had a position pointer moving through **characters**, the parser has a position pointer moving through **tokens**:

```python
class Parser:
    def __init__(self, tokens, error_handler):
        self.tokens = tokens   # the full list from the lexer
        self.pos    = 0        # current position
        self.errors = error_handler
```

### The Four Helper Methods

```python
def current(self) -> Token:
    """What token are we looking at right now?"""
    return self.tokens[self.pos]

def peek(self, offset=1) -> Token:
    """Look ahead without consuming."""
    return self.tokens[self.pos + offset]

def advance(self) -> Token:
    """Consume current token and move forward."""
    token = self.tokens[self.pos]
    self.pos += 1
    return token

def expect(self, type, value=None) -> Token:
    """Consume a token — but only if it matches what we expect.
       Reports an error if it does not match."""
    token = self.current()
    if token.type != type:
        self.errors.report("Parser", f"Expected {type.value}", token.line)
    return self.advance()
```

The `expect()` method is how the parser **enforces grammar rules**. Every time the grammar says a specific token must appear, the parser calls `expect()`.

---

## Grammar Rules → Parser Functions

Every BNF production rule in the MicroPy grammar maps directly to **one function** in the parser. This is the defining feature of a recursive descent parser.

### `<program> ::= <statement>+`

```python
def parse(self) -> ProgramNode:
    statements = []
    self.skip_newlines()

    while not self.is_at_end():
        stmt = self.parse_statement()  # parse one statement
        if stmt:
            statements.append(stmt)    # add to list
        self.skip_newlines()

    return ProgramNode(statements=statements)
```

The `+` in the grammar means "one or more" — the `while` loop handles this.

---

### `<statement> ::= <assignment> | <if_stmt> | <while_stmt> | <print_stmt>`

```python
def parse_statement(self):
    token = self.current()

    if token.value == "if":      return self.parse_if_statement()
    if token.value == "while":   return self.parse_while_statement()
    if token.value == "print":   return self.parse_print_statement()
    if token.type == IDENTIFIER: return self.parse_assignment()
    if token.value in ("int", "input", "str"):
                                 return self.parse_builtin_call()
```

The `|` in BNF (meaning "or") becomes an `if/elif` chain in code. The parser looks at the current token and immediately knows which rule to apply — this is what makes it **predictive**.

---

### `<assignment> ::= IDENTIFIER "=" <expression>`

```python
def parse_assignment(self) -> AssignmentNode:
    name_token = self.expect(TokenType.IDENTIFIER)  # consume x
    self.expect(TokenType.ASSIGNMENT)               # consume =
    value = self.parse_condition()                  # parse right side

    return AssignmentNode(name=name_token.value, value=value)
```

**Example trace** for `result = num1 + num2`:

```
expect(IDENTIFIER) → consumes "result"
expect(ASSIGNMENT) → consumes "="
parse_condition()  → parse_expression() → parse_term() → parse_factor()
                   → returns BinaryOpNode(IdentifierNode(num1), +, IdentifierNode(num2))

returns AssignmentNode(name="result", value=BinaryOpNode(...))
```

---

### `<if_stmt> ::= "if" <condition> ":" <block> [ "else" ":" <block> ]`

```python
def parse_if_statement(self) -> IfNode:
    self.expect(TokenType.KEYWORD, "if")    # consume "if"
    condition = self.parse_condition()       # parse the condition
    self.expect(TokenType.DELIMITER, ":")    # consume ":"
    self.skip_newlines()
    then_block = self.parse_block()          # parse indented block

    else_block = None
    if self.current().value == "else":       # optional else
        self.advance()                       # consume "else"
        self.expect(TokenType.DELIMITER, ":")
        self.skip_newlines()
        else_block = self.parse_block()

    return IfNode(condition=condition, then_block=then_block, else_block=else_block)
```

---

### `<block> ::= INDENT <statement>+ DEDENT`

```python
def parse_block(self) -> List:
    statements = []
    self.expect(TokenType.INDENT)    # must see INDENT — block starts

    while not self.is_at_end() and self.current().type != TokenType.DEDENT:
        stmt = self.parse_statement()
        if stmt:
            statements.append(stmt)
        self.skip_newlines()

    self.expect(TokenType.DEDENT)    # must see DEDENT — block ends
    return statements
```

The `INDENT` and `DEDENT` tokens were generated by the lexer from Python-style indentation. The parser treats them exactly like `{` and `}` in C-style languages.

---

## Operator Precedence

One of the most important design decisions in the parser is how it handles **operator precedence** — ensuring `2 + 3 * 4` evaluates as `2 + (3 * 4)` and not `(2 + 3) * 4`.

This is handled by the **layered structure** of three functions:

```
parse_condition()       handles:  ==  !=  <  >  and  or   (lowest priority)
    └── parse_expression()  handles:  +  -
            └── parse_term()      handles:  *  /               (highest priority)
                    └── parse_factor()   handles: values, ()
```

**Rule:** The deeper a function is, the higher its priority.

### `<expression> ::= <term> | <expression> "+" <term> | <expression> "-" <term>`

```python
def parse_expression(self):
    left = self.parse_term()    # always go deeper first

    while self.current().value in ('+', '-'):
        op    = self.advance().value
        right = self.parse_term()
        left  = BinaryOpNode(left=left, op=op, right=right)

    return left
```

### `<term> ::= <factor> | <term> "*" <factor> | <term> "/" <factor>`

```python
def parse_term(self):
    left = self.parse_factor()  # always go deeper first

    while self.current().value in ('*', '/'):
        op    = self.advance().value
        right = self.parse_factor()
        left  = BinaryOpNode(left=left, op=op, right=right)

    return left
```

### Proof with `2 + 3 * 4`

```
parse_expression() called
  → parse_term()
      → parse_factor() → NumberNode(2)
      → sees '*'? NO — '+' not handled here
      → returns NumberNode(2)
  → left = NumberNode(2)
  → sees '+' ✅ — consumes it
  → parse_term()                    ← right side
      → parse_factor() → NumberNode(3)
      → sees '*' ✅ — consumes it
      → parse_factor() → NumberNode(4)
      → returns BinaryOpNode(3 * 4) ← * resolved FIRST
  → left = BinaryOpNode(2 + BinaryOpNode(3 * 4))
```

**Result:**

```
BinaryOpNode (+)
├── NumberNode → 2
└── BinaryOpNode (*)    ← deeper = higher priority = runs first
    ├── NumberNode → 3
    └── NumberNode → 4
```

---

## Walking Through a Full Example

Let's trace what happens when the parser processes this line:

```python
if operator == 1:
    result = num1 * num2
```

**Token stream:**

```
KEYWORD(if), IDENTIFIER(operator), COMPARE_OP(==), NUMBER(1),
DELIMITER(:), NEWLINE, INDENT, IDENTIFIER(result), ASSIGNMENT(=),
IDENTIFIER(num1), OPERATOR(*), IDENTIFIER(num2), NEWLINE, DEDENT
```

**Parser trace:**

```
parse_statement()
  → sees KEYWORD "if" → calls parse_if_statement()
      expect("if")           → ✅ consumes KEYWORD(if)
      parse_condition()
        parse_expression()
          parse_term()
            parse_factor()   → returns IdentifierNode("operator")
        sees COMPARE_OP(==)  → consumes it
        parse_expression()
          parse_term()
            parse_factor()   → returns NumberNode("1")
        returns BinaryOpNode(operator == 1)
      expect(":")            → ✅ consumes DELIMITER(:)
      skip_newlines()        → skips NEWLINE
      parse_block()
        expect(INDENT)       → ✅ consumes INDENT
        parse_statement()
          → sees IDENTIFIER + ASSIGNMENT → calls parse_assignment()
              expect(IDENTIFIER)  → ✅ consumes "result"
              expect(ASSIGNMENT)  → ✅ consumes "="
              parse_condition()
                parse_expression()
                  parse_term()
                    parse_factor() → IdentifierNode("num1")
                    sees OPERATOR(*) → consumes it
                    parse_factor() → IdentifierNode("num2")
                    returns BinaryOpNode(num1 * num2)
              returns AssignmentNode("result", BinaryOpNode(*))
        expect(DEDENT)       → ✅ consumes DEDENT
        returns [AssignmentNode(...)]
      returns IfNode(
          condition  = BinaryOpNode(operator == 1),
          then_block = [AssignmentNode(result = BinaryOpNode(num1 * num2))],
          else_block = None
      )
```

---

## The Final AST Output

Running the full calculator program through the parser produces this tree (abbreviated):

```
ProgramNode (20 statements)
├── AssignmentNode → num1
│   └── BuiltinCallNode → int()
│       └── BuiltinCallNode → input()
│           └── StringNode → 'enter first number'
├── AssignmentNode → num2
│   └── BuiltinCallNode → int()
│       └── BuiltinCallNode → input()
│           └── StringNode → 'enter second number'
├── IfNode
│   ├── condition:
│   │   └── BinaryOpNode (==)
│   │       ├── IdentifierNode → operator
│   │       └── NumberNode → 1
│   └── then:
│       └── AssignmentNode → result
│           └── BinaryOpNode (*)
│               ├── IdentifierNode → num1
│               └── IdentifierNode → num2
├── WhileNode
│   ├── condition:
│   │   └── BinaryOpNode (<)
│   │       ├── IdentifierNode → result
│   │       └── NumberNode → 5
│   └── body:
│       └── PrintNode
│           └── IdentifierNode → message
└── IfNode
    ├── condition:
    │   └── LogicalOpNode (and)
    │       ├── IdentifierNode → boolean_value
    │       └── BinaryOpNode (<)
    │           ├── IdentifierNode → num1
    │           └── NumberNode → 3
    └── then:
        └── PrintNode
            └── FStringNode → f'the boolean value was {boolean_value}...'
```

---

## Error Handling

The parser uses a **non-crashing** error strategy — when it encounters an unexpected token, it reports the error and tries to continue parsing the rest of the program. This gives you all errors at once instead of stopping at the first one.

```python
def expect(self, type, value=None):
    token = self.current()
    if token.type != type:
        self.errors.report(
            "Parser",
            f"Expected {type.value} but got {token.type.value} '{token.value}'",
            token.line
        )
        return token   # ← return without advancing, try to recover
    return self.advance()
```

**Example error output:**

```
[Parser Error] Line 5: Expected DELIMITER ':' but got NEWLINE '\n'
```

---

## Running the Parser

```bash
# Run on the default sample
python main.py

# Run on your own .mpy file
python main.py myprogram.mpy

# Run on the test precedence file
python main.py samples/test_precedence.mpy
```

The output shows **Phase 1** (lexical analysis with token list) followed by **Phase 2** (parser results with any syntax errors).

**Sample Output:**

```
  PHASE 1 — Lexical Analysis 

  TOKEN TYPE      | VALUE                               | LINE
  NUMBER          | '10'                                | 1
  ASSIGNMENT      | '='                                 | 1
  IDENTIFIER      | 'x'                                 | 1

  Total tokens: 3

 PHASE 2 : Parser => Parsing (AST)
  ────────────────────────────────────────────────────────────
Parser Error: Unexpected token '10' on line 1
Parser Error: Unexpected token '=' on line 1
Parser Error: Unexpected token 'x' on line 1

3 error(s) found
```

---

## Quick Reference

| BNF Rule | Parser Function | Returns |
|---|---|---|
| `<program>` | `parse()` | `ProgramNode` |
| `<statement>` | `parse_statement()` | Any statement node |
| `<assignment>` | `parse_assignment()` | `AssignmentNode` |
| `<if_stmt>` | `parse_if_statement()` | `IfNode` |
| `<while_stmt>` | `parse_while_statement()` | `WhileNode` |
| `<print_stmt>` | `parse_print_statement()` | `PrintNode` |
| `<block>` | `parse_block()` | `List[Node]` |
| `<condition>` | `parse_condition()` | `BinaryOpNode` or `LogicalOpNode` |
| `<expression>` | `parse_expression()` | `BinaryOpNode` or factor |
| `<term>` | `parse_term()` | `BinaryOpNode` or factor |
| `<factor>` | `parse_factor()` | Leaf node or `BuiltinCallNode` |
| `<builtin_call>` | `parse_builtin_call()` | `BuiltinCallNode` |

---

## Source Code

The full parser source code is available at:

**[github.com/John-hack321/micropy](https://github.com/John-hack321/micropy/tree/master)**

```
micropy/
├── parser/
│   ├── nodes.py      ← AST node definitions
│   └── parser.py     ← Recursive descent parser
├── lexer/
│   ├── token.py      ← Token definitions
│   └── lexer.py      ← Scanner
├── utils/
│   └── error_handler.py
└── main.py           ← Entry point
```
