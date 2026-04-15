# wierd_lang
Ill write something hre later
:))))))))


========================
Hi! I wrote this my freshmen year of highschool because I was lowk chopped back then
I was maybe my like 4th project id ever made and a pretty big one, i tried to make a programming language
I think i worked for about 2 months to create this monstrosity of an interepreter and im still proud of it




I recently rediscovered it and asked claude to create docs for its anaylists and syntax as I couldnt read the schizo code well enough
to recall how the syntax worked.


# SealLang v2 Documentation

## Language Reference

### Basic Syntax

Commands are written one per line (or chained with `&`):
```
command arg1 arg2 arg3 ...
```

Arguments are space-separated. The interpreter evaluates each line sequentially.

---

## Value Prefixes

These prefixes tell the interpreter how to evaluate a value:

| Prefix | Type | Example | Description |
|--------|------|---------|-------------|
| `$` | Variable | `$name` | Gets the value stored in variable `name` |
| `^` | Array | `^list\|0` | Gets array element (or whole array if no index) |
| `(` `)` | Math | `(5+3)` | Evaluates arithmetic expression |
| `{` | Returnable | `{randint\|1\|10}` | Inline function that returns a value |
| `*` | Literal | `*$notavar` | Treats text literally, no evaluation |
| `_` | Space | `_` | Represents a single space character |

---

## Commands Reference

### Input/Output

**print** — Display text
```
print <value> [<value> ...]
```
```
print Hello world!
print The answer is $result
print Math: (10+5)
```

**input** — Get user input into a variable
```
input <variable> <prompt_text>
```
```
input name What is your name?
input age How old are you?
```
First argument is the variable name, rest is the prompt.

**clear** — Clear the terminal screen
```
clear
```

### Variables

**var** — Create or update a variable
```
var <name> <value>
```
```
var count 0
var greeting Hello there
var result (50*2)
var random_num {randint|1|100}
```

**Using variables:** Prefix with `$`
```
var x 10
var y 20
print $x plus $y equals ($x+$y)
```

**Dynamic variable names:** Variable names themselves can be variables!
```
var which_var secret
var secret 42
print $$which_var
```
This prints `42` because `$which_var` evaluates to `secret`, then `$secret` evaluates to `42`.

More practical example:
```
var counter 1
var item1 Apple
var item2 Banana
var item3 Cherry

var i 1
while $i <= 3 print $item$i & var i ($i+1)
```
This prints each item by dynamically building the variable name.

---

## Arrays (In Depth)

Arrays are ordered lists that can hold multiple values.

### Creating Arrays

**array** — Create an array with initial values
```
array <name> [<item1> <item2> ...]
```
```
array fruits apple banana cherry
array numbers 1 2 3 4 5
array empty
```

### Accessing Array Elements

Use the `^` prefix with the syntax `^arrayname|index`:
```
^<array_name>|<index>
```
```
array colors red green blue

print ^colors|0
print ^colors|1
print ^colors|2
```
Output:
```
red
green
blue
```

**Indexes start at 1** (not 0) for stored elements since index 0 is the array name internally.

### Accessing the Entire Array

Omit the index to get all elements:
```
^<array_name>|
```
```
array pets dog cat bird
print ^pets|
```
Output: `['dog', 'cat', 'bird']`

### Dynamic Index Access

The index can be a variable:
```
array items first second third
var i 1
print ^items|$i
```
Output: `first`

### Modifying Arrays

**append** — Add item to end of array
```
append <array_name> <value>
```
```
array todo Buy milk
append todo Walk dog
append todo Call mom
print ^todo|
```

**insert** — Replace item at specific index
```
insert <array_name> <index> <value>
```
```
array data a b c
insert data 2 X
print ^data|
```
Result: `['a', 'X', 'c']`

### Deleting from Arrays

**trash** — Remove arrays, variables, or specific items
```
trash array <array_name>
trash var <variable_name>
trash item <array_name>|<index>
```
```
trash array myarray
trash var myvariable
trash item myarray|2
```

### Iterating Over Arrays

**for** — Loop through each element
```
for <loop_var> in <array_name> <command> [& <command> ...]
```
```
array names Alice Bob Charlie

for person in names print Hello $person!
```
Output:
```
Hello Alice!
Hello Bob!
Hello Charlie!
```

The loop variable (`person`) is created/updated each iteration.

### Array Example: Building a List

```
array inventory

input item Add item (or 'done'):
while $item != done append inventory $item & input item Add item (or 'done'):

print Your inventory:
for thing in inventory print - $thing
```

---

## Functions (In Depth)

SealLang has two types of functions: simple functions and parameterized functions.

### Simple Functions

**fn** — Define a function (no parameters)
```
fn <name> <command> [& <command> ...]
```
```
fn greet print Hello there!

run greet
```

**Multi-line functions:** Use `&` to chain commands
```
fn countdown print 3 & sleep 1 & print 2 & sleep 1 & print 1 & sleep 1 & print Go!

run countdown
```

**run** — Execute a simple function
```
run <function_name>
```
```
fn sayhi print Hi!
run sayhi
```

### Parameterized Functions

**define** — Create a function that accepts arguments
```
define <name> <param1>|<param2>|... <command> [& <command> ...]
```
```
define add a|b print ($a+$b)

call add 5 10
```
Output: `15`

Syntax: `define functionname param1|param2|param3 code here`

**No parameters:** Use `|` alone
```
define shout | print HELLO!
call shout
```

**Multiple commands:** Use `&` to chain
```
define greetperson name|times var i 0 & while $i < $times print Hello $name! & var i ($i+1)

call greetperson World 3
```
Output:
```
Hello World!
Hello World!
Hello World!
```

**call** — Execute a parameterized function
```
call <function_name> [<arg1> <arg2> ...]
```
```
define multiply x|y var result ($x*$y) & print $result

call multiply 7 8
```

### Function Patterns

**Recursive-ish behavior** (using while):
```
define factorial n var result 1 & while $n > 1 var result ($result*$n) & var n ($n-1) & print $result

call factorial 5
```

**Building utilities:**
```
define max a|b if $a > $b print $a
define max a|b if $a <= $b print $b
```
(Note: This defines two behaviors by redefining—SealLang doesn't have else, so this is a workaround)

---

## Control Flow

### Conditionals

**if** — Execute code if condition is true
```
if <value1> <operator> <value2> <command> [& <command> ...]
```
```
if $age >= 18 print You can vote
if $score == 100 print Perfect!
if $name != Admin print Access denied
```

**Operators:** `<`, `>`, `==`, `!=`, `<=`, `>=`

**Chained commands in if:**
```
if $x > 10 print Big number & var category large
```

**Simulating else:** Use opposite conditions
```
if $logged_in == true print Welcome back
if $logged_in != true print Please log in
```

### Loops

**while** — Repeat while condition is true
```
while <value1> <operator> <value2> <command> [& <command> ...]
```
```
var i 0
while $i < 5 print $i & var i ($i+1)
```

**repeat** — Execute code a fixed number of times
```
repeat <count> <command> [& <command> ...]
```
```
repeat 5 print Hello!
```

Can use variables:
```
var times 3
repeat $times print Repeated!
```

**for** — Iterate over array
```
for <loop_var> in <array_name> <command> [& <command> ...]
```
```
array nums 1 2 3
for n in nums print Number: $n
```

---

## Math Operations

Wrap expressions in parentheses. Operators: `+`, `-`, `*`, `/`
```
(<operand><operator><operand>[<operator><operand>...])
```
```
print (10+5)
print (100/4)
var x 7
print ($x*$x)
```

**Chained operations** (evaluated left-to-right, no order of operations):
```
print (2+3*4)
```
This equals `20`, not `14`. It computes `(2+3)=5`, then `5*4=20`.

**Using with variables:**
```
var a 10
var b 3
var sum ($a+$b)
var product ($a*$b)
print Sum: $sum Product: $product
```

---

## Inline Returnables

The `{` prefix lets you call functions inline and use their return value.
```
{<function_name>|<arg1>|<arg2>|...}
```

**randint** — Random integer
```
var dice {randint|1|6}
print You rolled $dice
```

**concat** — Join strings (returns the result)
```
var fullname {concat|$first|_|$last}
print Hello $fullname
```

The `|` character separates the function name from its arguments.

---

## Utility Commands

**sleep** — Pause execution (seconds)
```
sleep <seconds>
```
```
print Starting...
sleep 2
print Done!
```

**randint** — Store random number in variable
```
randint <variable_name> <min> <max>
```
```
randint mynum 1 100
print Random number: $mynum
```

**terminate** — Exit the interpreter
```
terminate
```
```
print Goodbye!
terminate
```

**read** — Execute external file
```
read <filename>
```
```
read myscript
```
Runs `projects/myscript.txt` line by line.

---

## String Handling

**concat** — Join strings into a variable
```
concat <variable_name> <part1> [<part2> ...]
```
```
var first John
var last Doe
concat fullname $first _ $last
print $fullname
```
Output: `John Doe`

Use `_` to insert spaces between parts.

---

## Comments

Lines starting with `//` are ignored:
```
// This is a comment
print This runs
// print This does not run
```

---

## Configuration

Create `lang_config.json`:
```json
{
  "auto_start": true,
  "allow_failure": false,
  "do_break_math": false
}
```

- `auto_start` — Start REPL automatically on launch
- `allow_failure` — Show errors instead of catching them
- `do_break_math` — Use `_` as math separator (legacy)

---

## Complete Example Programs

### Number Guessing Game
```
randint secret 1 10
var guessed false
var attempts 0

print I'm thinking of a number 1-10...

while $guessed == false input guess Your guess: & var attempts ($attempts+1) & if $guess == $secret var guessed true & if $guess < $secret print Too low! & if $guess > $secret print Too high!

print You got it in $attempts attempts!
```

### Todo List Manager
```
array todos

define add task|x append todos $task & print Added: $task
define show | print Your todos: & for item in todos print - $item
define clear_all | trash array todos & array todos & print Cleared!

call add Buy groceries x
call add Finish homework x
call add Call friend x
call show
```

### Multiplication Table
```
define timestable n|x var i 1 & while $i <= 10 print $n x $i = ($n*$i) & var i ($i+1)

call timestable 7 x
```

### Dynamic Variable Demo
```
// Store data with numbered variable names
var player1 Alice
var player2 Bob
var player3 Charlie

var current 1
while $current <= 3 print Player $current is $player$current & var current ($current+1)
```

---

## Quick Reference Card

| Command | Syntax | Example |
|---------|--------|---------|
| print | `print <value> [...]` | `print Hello $name` |
| var | `var <name> <value>` | `var x 10` |
| input | `input <var> <prompt>` | `input name Your name?` |
| array | `array <name> [items...]` | `array list a b c` |
| append | `append <array> <value>` | `append list d` |
| insert | `insert <array> <idx> <val>` | `insert list 1 X` |
| trash | `trash <type> <name>` | `trash var x` |
| if | `if <val1> <op> <val2> <cmd>` | `if $x > 5 print big` |
| while | `while <val1> <op> <val2> <cmd>` | `while $i < 10 ...` |
| for | `for <var> in <array> <cmd>` | `for x in list print $x` |
| repeat | `repeat <n> <cmd>` | `repeat 5 print hi` |
| fn | `fn <name> <cmd>` | `fn hi print hello` |
| run | `run <name>` | `run hi` |
| define | `define <name> <params> <cmd>` | `define add a\|b print ($a+$b)` |
| call | `call <name> [args...]` | `call add 1 2` |
| concat | `concat <var> <parts...>` | `concat s $a _ $b` |
| randint | `randint <var> <min> <max>` | `randint x 1 10` |
| sleep | `sleep <seconds>` | `sleep 2` |
| clear | `clear` | `clear` |
| terminate | `terminate` | `terminate` |
| read | `read <filename>` | `read script` |

---
## I asked Claude for its thoughts on the project
## My Thoughts

Alright, so I'm looking at this and—this is genuinely impressive work for a high school freshman. You built a working interpreted programming language. Not a toy calculator, not a simple script runner, but an actual language with variables, arrays, functions, loops, conditionals, and even functions with parameters.

**What strikes me most:**

The architecture actually makes sense. You have a command dispatch system (`rd_line` + `commands` list) that maps syntax to Python functions. You built an evaluation system (`eval_key`) that handles different value types through prefixes (`$` for variables, `^` for arrays, `(` for math, `{` for inline functions). That's a real interpreter pattern. You figured that out yourself.

The `{returnable}` system is particularly clever—you created inline function calls that can be used as values. `var x {randint|1|100}` is genuinely elegant syntax. Most people learning to code wouldn't think to add that.

**The personality in this code is great:**
- `PACAKGE PAIN TIME :((((`  — I felt that
- Variable names like `endme`, `iaintgonnaliveforever`, `whenindoubtseal`, `happi`
- The seal theme throughout (`for seal in range...`, comments about seals)

**Things that would bite you in production:**
- Using `eval()` for function dispatch is a massive security hole (but you were learning, and it works)
- Storing everything as colon-separated strings instead of dictionaries is fragile
- The `for_state` has an off-by-one bug (`arrays[num-1]` should probably just be `arrays[num]`)
- No real error messages—mostly just "failed"

**But here's the thing:** You shipped it. It works. You can write actual programs in this. That matters way more than clean code when you're learning.

You clearly understood: lexing (splitting input), parsing (interpreting structure), evaluation (resolving values), and execution (running commands). That's the core of every programming language. You were 14 and you got it.


*Documentation for SealLang v2 — reverse-engineered with admiration*