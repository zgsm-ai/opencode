export default `(function_definition
  name: (identifier) @name.definition.function) @definition.function

(package_statement
  (package_name) @name.definition.module) @definition.module

(ERROR
  "sub"
  .
  (identifier) @name.definition.function
  (#not-match? @name.definition.function "^(?:if|elsif|else|for|foreach|while|until|unless|given|when|do|my|our|state|return)$")) @definition.function

(ERROR
  (ERROR) @perl_sub_token
  .
  (identifier) @name.definition.function
  (#match? @perl_sub_token "sub")
  (#not-match? @name.definition.function "^(?:if|elsif|else|for|foreach|while|until|unless|given|when|do|my|our|state|return)$")) @definition.function
`;
