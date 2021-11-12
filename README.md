# RPN Calculator with advanced features

## Auto Enter

This calculator works using RPN. As a convenience, a non-empty input
accumulator is treated as the top of stack. So, either of the
following produces the same result:

- `4` `enter` `5` `enter` `plus`
- `4` `enter` `5` `plus`

## Fractional Quantities

You can work with fractional quantities by chosing "fraction"
mode. The following are equivalent:

- `3` `num` `3` `denom` `4` `enter`
- `3` `enter` `3` `denom` `4` `+`
- `3` `enter` `3` `x/4` `+`
- `15` `denom` `4` `enter`
- `15` `4` `/`

Supported operations are the basic four functions, plus multiplicitive
inverse, and rational approximations.

## Physical Units

### US Customary Units

TBD
