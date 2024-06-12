
type Gensym<T> =
  T extends string
    ? { id: number, name: string }
    : { id: number } & T;
