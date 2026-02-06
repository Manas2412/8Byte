import { z } from "zod";

export const CreateUserSchema = z.object({
    email: z.string().email({ message: "Invalid email" }),
    password: z.string()
        .min(8, { message: "Password must be at least 8 characters" })
        .max(20, { message: "Password cannot exceed 20 characters" })
        .refine((password) => /[A-Z]/.test(password), {
            message: "Must contain at least one uppercase letter",
        })
        .refine((password) => /[a-z]/.test(password), {
            message: "Must contain at least one lowercase letter",
        })
        .refine((password) => /[0-9]/.test(password), {
            message: "Must contain at least one number",
        })
        .refine((password) => /[!@#$%^&*]/.test(password), {
            message: "Must contain at least one special character",
        }),
    name: z.string()
})

export const SigninSchema = z.object({
    email: z.string().email({ message: "Invalid email" }),
    password: z.string()
        .min(8, { message: "Password must be at least 8 characters" })
        .max(20, { message: "Password cannot exceed 20 characters" })
        .refine((password) => /[A-Z]/.test(password), {
            message: "Must contain at least one uppercase letter",
        })
        .refine((password) => /[a-z]/.test(password), {
            message: "Must contain at least one lowercase letter",
        })
        .refine((password) => /[0-9]/.test(password), {
            message: "Must contain at least one number",
        })
        .refine((password) => /[!@#$%^&*]/.test(password), {
            message: "Must contain at least one special character",
        }),
})
