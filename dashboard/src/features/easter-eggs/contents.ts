export const BORROW_CHECK = `error[E0507]: cannot move out of index of \`Vec<std::string::String>\`
   --> src/features/leveling/cache.rs:406:19
    |
406 |     let _stolen = data[0];
    |                   ^^^^^^^ move occurs because value has type \`std::string::String\`, which does not implement the \`Copy\` trait
    |
help: consider borrowing here
    |
406 |     let _stolen = &data[0];
    |                   +
help: consider cloning the value if the performance cost is acceptable
    |
406 |     let _stolen = data[0].clone();
    |                          ++++++++

error[E0502]: cannot borrow \`*data\` as mutable because it is also borrowed as immutable
   --> src/features/leveling/cache.rs:409:5
    |
408 |     let read1 = &data[0];
    |                  ---- immutable borrow occurs here
409 |     data.push("boom".into());
    |     ^^^^^^^^^^^^^^^^^^^^^^^^ mutable borrow occurs here
410 |     let _ = read1.len();
    |             ----- immutable borrow later used here

error[E0499]: cannot borrow \`*data\` as mutable more than once at a time
   --> src/features/leveling/cache.rs:412:21
    |
401 | fn borrow_checker_speedrun<'a>(
    |                            -- lifetime \`'a\` defined here
...
411 |     let mut1 = &mut data[0];
    |                     ---- first mutable borrow occurs here
412 |     let mut2 = &mut data[1];
    |                     ^^^^ second mutable borrow occurs here
...
424 |     (&local, mut1)
    |     -------------- returning this value requires that \`*data\` is borrowed for \`'a\`
    |
    = help: use \`.split_at_mut(position)\` to obtain two mutable non-overlapping sub-slices

error[E0502]: cannot borrow \`*data\` as immutable because it is also borrowed as mutable
   --> src/features/leveling/cache.rs:415:18
    |
401 | fn borrow_checker_speedrun<'a>(
    |                            -- lifetime \`'a\` defined here
...
411 |     let mut1 = &mut data[0];
    |                     ---- mutable borrow occurs here
...
415 |     let read2 = &data[0];
    |                  ^^^^ immutable borrow occurs here
...
424 |     (&local, mut1)
    |     -------------- returning this value requires that \`*data\` is borrowed for \`'a\`

error[E0499]: cannot borrow \`*data\` as mutable more than once at a time
   --> src/features/leveling/cache.rs:416:5
    |
401 | fn borrow_checker_speedrun<'a>(
    |                            -- lifetime \`'a\` defined here
...
411 |     let mut1 = &mut data[0];
    |                     ---- first mutable borrow occurs here
...
416 |     data[0] = "overwrite".into();
    |     ^^^^ second mutable borrow occurs here
...
424 |     (&local, mut1)
    |     -------------- returning this value requires that \`*data\` is borrowed for \`'a\`

error[E0505]: cannot move out of \`opt\` because it is borrowed
   --> src/features/leveling/cache.rs:419:25
    |
403 |     opt: Option<String>,
    |     --- binding \`opt\` declared here
...
418 |     let opt_borrow = &opt;
    |                      ---- borrow of \`opt\` occurs here
419 |     let _opt_consumed = opt;
    |                         ^^^ move out of \`opt\` occurs here
420 |     let _ = opt_borrow.is_some();
    |             ---------- borrow later used here
    |
help: consider cloning the value if the performance cost is acceptable
    |
418 |     let opt_borrow = &opt.clone();
    |                          ++++++++

error[E0373]: closure may outlive the current function, but it borrows \`local\`, which is owned by the current function
   --> src/features/leveling/cache.rs:421:19
    |
421 |     thread::spawn(|| {
    |                   ^^ may outlive borrowed value \`local\`
422 |         println!("{local}");
    |                    ----- \`local\` is borrowed here
    |
note: function requires argument type to outlive \`'static\`
   --> src/features/leveling/cache.rs:421:5
    |
421 | /     thread::spawn(|| {
422 | |         println!("{local}");
423 | |     });
    | |______^
help: to force the closure to take ownership of \`local\` (and any other referenced variables), use the \`move\` keyword
    |
421 |     thread::spawn(move || {
    |                   ++++

error[E0515]: cannot return value referencing local variable \`local\`
   --> src/features/leveling/cache.rs:424:5
    |
424 |     (&local, mut1)
    |     ^------^^^^^^^
    |     ||
    |     |\`local\` is borrowed here
    |     returns a value referencing data owned by the current function`