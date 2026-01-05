-- Cleanup script for user juventuspadelfutbol@gmail.com
-- First, find the user ID
DO $$
DECLARE
    user_id UUID;
    establishment_id UUID;
BEGIN
    -- Get user ID
    SELECT id INTO user_id FROM "Users" WHERE email = 'juventuspadelfutbol@gmail.com';
    
    IF user_id IS NULL THEN
        RAISE NOTICE 'User not found';
        RETURN;
    END IF;
    
    RAISE NOTICE 'User ID: %', user_id;
    
    -- Get establishment ID
    SELECT id INTO establishment_id FROM "Establishments" WHERE "userId" = user_id;
    
    IF establishment_id IS NULL THEN
        RAISE NOTICE 'Establishment not found';
        RETURN;
    END IF;
    
    RAISE NOTICE 'Establishment ID: %', establishment_id;
    
    -- Delete BookingPayments for bookings in this establishment
    DELETE FROM "BookingPayments" 
    WHERE "bookingId" IN (
        SELECT id FROM "Bookings" WHERE "establishmentId" = establishment_id
    );
    RAISE NOTICE 'Deleted BookingPayments';
    
    -- Delete Bookings
    DELETE FROM "Bookings" WHERE "establishmentId" = establishment_id;
    RAISE NOTICE 'Deleted Bookings';
    
    -- Delete RecurringBookingGroups
    DELETE FROM "RecurringBookingGroups" WHERE "establishmentId" = establishment_id;
    RAISE NOTICE 'Deleted RecurringBookingGroups';
    
    RAISE NOTICE 'Cleanup completed successfully';
END $$;
